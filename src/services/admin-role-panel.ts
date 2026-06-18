import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type Guild,
  type Message,
  type Role,
} from 'discord.js';
import { prisma } from '../database/prisma.js';
import { baseEmbed, successEmbed } from '../shared/embeds.js';
import { OWNER_RESTRICTED_COMMANDS } from '../shared/constants.js';
import { registry } from '../core/command-registry.js';

const ROLES_PER_PAGE = 20;
const CMDS_PER_PAGE = 25;
const SESSION_TTL_MS = 300_000;

interface DraftConfig {
  allowedCommands: string[];
}

interface PanelSession {
  guildId: string;
  userId: string;
  page: number;
  cmdPage: number;
  phase: 'pick' | 'configure' | 'commands';
  selectedRoleId: string | null;
  queue: string[];
  drafts: Map<string, DraftConfig>;
  expires: number;
}

const sessions = new Map<string, PanelSession>();

function sessionKey(messageId: string): string {
  return messageId;
}

function defaultDraft(): DraftConfig {
  return { allowedCommands: [] };
}

function getSession(messageId: string): PanelSession | null {
  const s = sessions.get(messageId);
  if (!s || s.expires < Date.now()) {
    sessions.delete(messageId);
    return null;
  }
  return s;
}

function sortedRoles(guild: Guild): Role[] {
  return [...guild.roles.cache.values()]
    .filter((r) => !r.managed && r.id !== guild.id)
    .sort((a, b) => b.position - a.position);
}

function getAdminGrantableCommands(): string[] {
  return registry
    .list()
    .filter((c) => c.permission === 'admin' && !OWNER_RESTRICTED_COMMANDS.has(c.name))
    .map((c) => c.name)
    .sort();
}

function roleHasAdministrator(role: Role): boolean {
  return role.permissions.has(PermissionFlagsBits.Administrator);
}

function buildPickComponents(session: PanelSession, guild: Guild) {
  const roles = sortedRoles(guild);
  const start = session.page * ROLES_PER_PAGE;
  const slice = roles.slice(start, start + ROLES_PER_PAGE);
  const select = new StringSelectMenuBuilder()
    .setCustomId('aroles:pick')
    .setPlaceholder('اختر رولاً إدارياً (من الأعلى للأقل)')
    .addOptions(
      slice.map((r) => ({
        label: r.name.slice(0, 100),
        value: r.id,
        description: `${roleHasAdministrator(r) ? 'أدمن Discord • ' : ''}موقع ${r.position}`.slice(
          0,
          100,
        ),
      })),
    );

  const prev = new ButtonBuilder()
    .setCustomId('aroles:prev')
    .setLabel('السابق')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(session.page === 0);
  const next = new ButtonBuilder()
    .setCustomId('aroles:next')
    .setLabel('التالي')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(start + ROLES_PER_PAGE >= roles.length);
  const done = new ButtonBuilder()
    .setCustomId('aroles:done')
    .setLabel('انتهيت')
    .setStyle(ButtonStyle.Success);

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    new ActionRowBuilder<ButtonBuilder>().addComponents(prev, next, done),
  ];
}

function describeRole(role: Role | undefined, d: DraftConfig): string {
  const implicit = role ? roleHasAdministrator(role) : false;
  const lines = [
    implicit
      ? 'هذا الرول يملك صلاحية Administrator — جميع الأوامر الإدارية (ما عدا أوامر المالك) مفعّلة تلقائياً.'
      : 'حدد الأوامر الإدارية المسموحة لهذا الرول.',
    '',
    `الأوامر المحددة: ${d.allowedCommands.length ? d.allowedCommands.join(', ') : 'لا يوجد'}`,
  ];
  return lines.join('\n');
}

function buildConfigureComponents(session: PanelSession, guild: Guild) {
  if (!session.selectedRoleId) return [];
  const role = guild.roles.cache.get(session.selectedRoleId);
  const implicitAdmin = role ? roleHasAdministrator(role) : false;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('aroles:cmds')
      .setLabel('اختر الأوامر')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(implicitAdmin),
    new ButtonBuilder()
      .setCustomId('aroles:nextrole')
      .setLabel('الرول التالي')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('aroles:done')
      .setLabel('انتهيت')
      .setStyle(ButtonStyle.Success),
  );
  return [row];
}

function buildCmdSelect(session: PanelSession) {
  if (!session.selectedRoleId) return [];
  const grantable = getAdminGrantableCommands();
  const start = session.cmdPage * CMDS_PER_PAGE;
  const slice = grantable.slice(start, start + CMDS_PER_PAGE);
  const d = session.drafts.get(session.selectedRoleId) ?? defaultDraft();

  const select = new StringSelectMenuBuilder()
    .setCustomId('aroles:cmdsel')
    .setPlaceholder(`أوامر إدارية (صفحة ${session.cmdPage + 1})`)
    .setMinValues(0)
    .setMaxValues(Math.max(slice.length, 1))
    .addOptions(
      slice.map((c) => ({
        label: c,
        value: c,
        default: d.allowedCommands.includes(c),
      })),
    );

  const prev = new ButtonBuilder()
    .setCustomId('aroles:cmdprev')
    .setLabel('أوامر سابقة')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(session.cmdPage === 0);
  const next = new ButtonBuilder()
    .setCustomId('aroles:cmdnext')
    .setLabel('أوامر تالية')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(start + CMDS_PER_PAGE >= grantable.length);
  const back = new ButtonBuilder()
    .setCustomId('aroles:backcfg')
    .setLabel('رجوع')
    .setStyle(ButtonStyle.Secondary);

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    new ActionRowBuilder<ButtonBuilder>().addComponents(prev, next, back),
  ];
}

async function applyDrafts(guild: Guild, session: PanelSession): Promise<void> {
  await prisma.adminRole.deleteMany({ where: { guildId: guild.id } });
  let order = 0;
  for (const [roleId, d] of session.drafts.entries()) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;
    await prisma.adminRole.create({
      data: {
        guildId: guild.id,
        roleId,
        sortOrder: order++,
        allowedCommands: JSON.stringify(
          roleHasAdministrator(role) ? getAdminGrantableCommands() : d.allowedCommands,
        ),
      },
    });
  }
}

export async function openAdminRolePanel(
  message: Message<true>,
  guild: Guild,
  userId: string,
): Promise<void> {
  await guild.roles.fetch().catch(() => {});
  const session: PanelSession = {
    guildId: guild.id,
    userId,
    page: 0,
    cmdPage: 0,
    phase: 'pick',
    selectedRoleId: null,
    queue: [],
    drafts: new Map(),
    expires: Date.now() + SESSION_TTL_MS,
  };

  const panel = await message.reply({
    embeds: [
      baseEmbed()
        .setTitle('الرولات الإدارية')
        .setDescription(
          [
            'اختر الرولات من **الأعلى إلى الأقل** وحدد الأوامر الإدارية لكل رول.',
            'الرولات التي تملك **Administrator** تحصل تلقائياً على كل الأوامر الإدارية (ما عدا أوامر المالك/الوايت لست).',
          ].join('\n'),
        ),
    ],
    components: buildPickComponents(session, guild),
  });
  sessions.set(sessionKey(panel.id), session);

  const collector = panel.createMessageComponentCollector({
    time: SESSION_TTL_MS,
    filter: (i) => i.user.id === userId,
  });

  collector.on('collect', async (interaction) => {
    const s = getSession(panel.id);
    if (!s) return;

    if (interaction.isStringSelectMenu() && interaction.customId === 'aroles:pick') {
      const roleId = interaction.values[0];
      s.selectedRoleId = roleId;
      s.phase = 'configure';
      s.cmdPage = 0;
      if (!s.drafts.has(roleId)) s.drafts.set(roleId, defaultDraft());
      if (!s.queue.includes(roleId)) s.queue.push(roleId);
      const role = guild.roles.cache.get(roleId);
      const d = s.drafts.get(roleId) ?? defaultDraft();
      await interaction.update({
        embeds: [
          baseEmbed()
            .setTitle(`إعداد إداري: ${role?.name ?? roleId}`)
            .setDescription(describeRole(role, d)),
        ],
        components: buildConfigureComponents(s, guild),
      });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'aroles:cmdsel') {
      if (!s.selectedRoleId) return;
      const d = s.drafts.get(s.selectedRoleId) ?? defaultDraft();
      const grantable = getAdminGrantableCommands();
      const start = s.cmdPage * CMDS_PER_PAGE;
      const pageCmds = new Set(grantable.slice(start, start + CMDS_PER_PAGE));
      const kept = d.allowedCommands.filter((c) => !pageCmds.has(c));
      d.allowedCommands = [...kept, ...interaction.values];
      s.drafts.set(s.selectedRoleId, d);
      const role = guild.roles.cache.get(s.selectedRoleId);
      await interaction.update({
        embeds: [
          baseEmbed()
            .setTitle(`أوامر: ${role?.name ?? s.selectedRoleId}`)
            .setDescription(`محدد: ${d.allowedCommands.length} أمر`),
        ],
        components: buildCmdSelect(s),
      });
      return;
    }

    if (!interaction.isButton()) return;
    const btn = interaction as ButtonInteraction;

    if (btn.customId === 'aroles:prev') {
      s.page = Math.max(0, s.page - 1);
      s.phase = 'pick';
      await btn.update({
        embeds: [baseEmbed().setTitle('الرولات الإدارية').setDescription(`صفحة ${s.page + 1}`)],
        components: buildPickComponents(s, guild),
      });
      return;
    }
    if (btn.customId === 'aroles:next') {
      s.page += 1;
      s.phase = 'pick';
      await btn.update({
        embeds: [baseEmbed().setTitle('الرولات الإدارية').setDescription(`صفحة ${s.page + 1}`)],
        components: buildPickComponents(s, guild),
      });
      return;
    }
    if (btn.customId === 'aroles:backcfg' && s.selectedRoleId) {
      s.phase = 'configure';
      const role = guild.roles.cache.get(s.selectedRoleId);
      const d = s.drafts.get(s.selectedRoleId) ?? defaultDraft();
      await btn.update({
        embeds: [
          baseEmbed()
            .setTitle(`إعداد إداري: ${role?.name ?? s.selectedRoleId}`)
            .setDescription(describeRole(role, d)),
        ],
        components: buildConfigureComponents(s, guild),
      });
      return;
    }
    if (btn.customId === 'aroles:cmds' && s.selectedRoleId) {
      s.phase = 'commands';
      await btn.update({
        embeds: [baseEmbed().setTitle('اختر الأوامر الإدارية المسموحة')],
        components: buildCmdSelect(s),
      });
      return;
    }
    if (btn.customId === 'aroles:cmdprev') {
      s.cmdPage = Math.max(0, s.cmdPage - 1);
      await btn.update({
        embeds: [baseEmbed().setTitle('اختر الأوامر الإدارية المسموحة')],
        components: buildCmdSelect(s),
      });
      return;
    }
    if (btn.customId === 'aroles:cmdnext') {
      s.cmdPage += 1;
      await btn.update({
        embeds: [baseEmbed().setTitle('اختر الأوامر الإدارية المسموحة')],
        components: buildCmdSelect(s),
      });
      return;
    }
    if (btn.customId === 'aroles:nextrole') {
      s.phase = 'pick';
      s.selectedRoleId = null;
      s.cmdPage = 0;
      await btn.update({
        embeds: [
          baseEmbed()
            .setTitle('الرولات الإدارية')
            .setDescription('اختر الرول الإداري التالي من القائمة.'),
        ],
        components: buildPickComponents(s, guild),
      });
      return;
    }
    if (btn.customId === 'aroles:done') {
      await btn.deferUpdate();
      await applyDrafts(guild, s);
      sessions.delete(panel.id);
      await panel.edit({
        embeds: [successEmbed(`تم حفظ ${s.drafts.size} رول إداري.`)],
        components: [],
      });
      collector.stop();
    }
  });

  collector.on('end', () => {
    sessions.delete(panel.id);
    panel.edit({ components: [] }).catch(() => {});
  });
}

export async function getAdminRoleAllowedCommands(
  guildId: string,
  roleIds: string[],
): Promise<Set<string>> {
  if (!roleIds.length) return new Set();
  const rows = await prisma.adminRole.findMany({
    where: { guildId, roleId: { in: roleIds } },
  });
  const cmds = new Set<string>();
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.allowedCommands);
      if (Array.isArray(parsed)) parsed.forEach((c) => cmds.add(String(c)));
    } catch {
      // ignore
    }
  }
  return cmds;
}

export function memberHasDiscordAdministrator(member: import('discord.js').GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}
