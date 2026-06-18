import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type Guild,
  type Message,
} from 'discord.js';
import { prisma } from '../database/prisma.js';
import { baseEmbed, successEmbed } from '../shared/embeds.js';
import { INTERACTIVE_GRANTABLE_COMMANDS } from '../shared/constants.js';
import { buildInteractiveGuildPermissions } from './role-permission-matrix.js';

const ROLES_PER_PAGE = 20;
const SESSION_TTL_MS = 300_000;

interface DraftConfig {
  attachFiles: boolean;
  mentionEveryone: boolean;
  stream: boolean;
  muteMembers: boolean;
  deafenMembers: boolean;
  allowedCommands: string[];
}

interface PanelSession {
  guildId: string;
  userId: string;
  page: number;
  phase: 'pick' | 'configure';
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
  return {
    attachFiles: false,
    mentionEveryone: false,
    stream: false,
    muteMembers: false,
    deafenMembers: false,
    allowedCommands: [],
  };
}

function getSession(messageId: string): PanelSession | null {
  const s = sessions.get(messageId);
  if (!s || s.expires < Date.now()) {
    sessions.delete(messageId);
    return null;
  }
  return s;
}

function sortedRoles(guild: Guild) {
  return [...guild.roles.cache.values()]
    .filter((r) => !r.managed && r.id !== guild.id)
    .sort((a, b) => b.position - a.position);
}

function buildPickComponents(session: PanelSession, guild: Guild) {
  const roles = sortedRoles(guild);
  const start = session.page * ROLES_PER_PAGE;
  const slice = roles.slice(start, start + ROLES_PER_PAGE);
  const select = new StringSelectMenuBuilder()
    .setCustomId('iroles:pick')
    .setPlaceholder('اختر رولاً للإعداد')
    .addOptions(
      slice.map((r) => ({
        label: r.name.slice(0, 100),
        value: r.id,
        description: `الموقع: ${r.position}`.slice(0, 100),
      })),
    );

  const prev = new ButtonBuilder()
    .setCustomId('iroles:prev')
    .setLabel('السابق')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(session.page === 0);
  const next = new ButtonBuilder()
    .setCustomId('iroles:next')
    .setLabel('التالي')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(start + ROLES_PER_PAGE >= roles.length);
  const done = new ButtonBuilder()
    .setCustomId('iroles:done')
    .setLabel('انتهيت')
    .setStyle(ButtonStyle.Success);

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    new ActionRowBuilder<ButtonBuilder>().addComponents(prev, next, done),
  ];
}

function toggleLabel(on: boolean): string {
  return on ? 'مفعّل' : 'معطّل';
}

function buildConfigureComponents(session: PanelSession) {
  if (!session.selectedRoleId) return [];
  const d = session.drafts.get(session.selectedRoleId) ?? defaultDraft();
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('iroles:t:attach')
      .setLabel(`صور: ${toggleLabel(d.attachFiles)}`)
      .setStyle(d.attachFiles ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('iroles:t:mention')
      .setLabel(`منشن: ${toggleLabel(d.mentionEveryone)}`)
      .setStyle(d.mentionEveryone ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('iroles:t:stream')
      .setLabel(`بث: ${toggleLabel(d.stream)}`)
      .setStyle(d.stream ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('iroles:t:mute')
      .setLabel(`ميوت: ${toggleLabel(d.muteMembers)}`)
      .setStyle(d.muteMembers ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('iroles:t:deafen')
      .setLabel(`دفن: ${toggleLabel(d.deafenMembers)}`)
      .setStyle(d.deafenMembers ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('iroles:cmds')
      .setLabel('أوامر الإدارة')
      .setStyle(ButtonStyle.Primary),
  );
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('iroles:nextrole')
      .setLabel('الرول التالي')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('iroles:done')
      .setLabel('انتهيت')
      .setStyle(ButtonStyle.Success),
  );
  return [row1, row2, row3];
}

function buildCmdSelect(session: PanelSession) {
  if (!session.selectedRoleId) return [];
  const d = session.drafts.get(session.selectedRoleId) ?? defaultDraft();
  const select = new StringSelectMenuBuilder()
    .setCustomId('iroles:cmdsel')
    .setPlaceholder('اختر أوامر الإدارة المسموحة')
    .setMinValues(0)
    .setMaxValues(INTERACTIVE_GRANTABLE_COMMANDS.length)
    .addOptions(
      INTERACTIVE_GRANTABLE_COMMANDS.map((c) => ({
        label: c,
        value: c,
        default: d.allowedCommands.includes(c),
      })),
    );
  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('iroles:backcfg')
        .setLabel('رجوع')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

async function applyDrafts(guild: Guild, session: PanelSession): Promise<void> {
  const entries = [...session.drafts.entries()];
  await prisma.interactiveRole.deleteMany({ where: { guildId: guild.id } });
  let order = 0;
  for (const [roleId, d] of entries) {
    await prisma.interactiveRole.create({
      data: {
        guildId: guild.id,
        roleId,
        sortOrder: order++,
        attachFiles: d.attachFiles,
        mentionEveryone: d.mentionEveryone,
        stream: d.stream,
        muteMembers: d.muteMembers,
        deafenMembers: d.deafenMembers,
        allowedCommands: JSON.stringify(d.allowedCommands),
      },
    });
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;
    const bits = buildInteractiveGuildPermissions(d);
    await role.setPermissions(bits, 'SysBot: interactive role panel').catch(() => {});
  }
}

export async function openInteractiveRolePanel(
  message: Message<true>,
  guild: Guild,
  userId: string,
): Promise<void> {
  await guild.roles.fetch().catch(() => {});
  const session: PanelSession = {
    guildId: guild.id,
    userId,
    page: 0,
    phase: 'pick',
    selectedRoleId: null,
    queue: [],
    drafts: new Map(),
    expires: Date.now() + SESSION_TTL_MS,
  };
  const panel = await message.reply({
    embeds: [
      baseEmbed()
        .setTitle('الرولات التفاعلية')
        .setDescription(
          'اختر أعلى رول تفاعلي من القائمة، اضبط صلاحياته، ثم «الرول التالي» أو «انتهيت».',
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

    if (interaction.isStringSelectMenu() && interaction.customId === 'iroles:pick') {
      const roleId = interaction.values[0];
      s.selectedRoleId = roleId;
      s.phase = 'configure';
      if (!s.drafts.has(roleId)) s.drafts.set(roleId, defaultDraft());
      if (!s.queue.includes(roleId)) s.queue.push(roleId);
      const role = guild.roles.cache.get(roleId);
      await interaction.update({
        embeds: [
          baseEmbed()
            .setTitle(`إعداد: ${role?.name ?? roleId}`)
            .setDescription('اضبط الصلاحيات ثم انتقل للرول التالي أو اضغط انتهيت.'),
        ],
        components: buildConfigureComponents(s),
      });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'iroles:cmdsel') {
      if (!s.selectedRoleId) return;
      const d = s.drafts.get(s.selectedRoleId) ?? defaultDraft();
      d.allowedCommands = [...interaction.values];
      s.drafts.set(s.selectedRoleId, d);
      const role = guild.roles.cache.get(s.selectedRoleId);
      await interaction.update({
        embeds: [
          baseEmbed()
            .setTitle(`إعداد: ${role?.name ?? s.selectedRoleId}`)
            .setDescription(`الأوامر: ${d.allowedCommands.join(', ') || 'لا يوجد'}`),
        ],
        components: buildConfigureComponents(s),
      });
      return;
    }

    if (!interaction.isButton()) return;
    const btn = interaction as ButtonInteraction;

    if (btn.customId === 'iroles:prev') {
      s.page = Math.max(0, s.page - 1);
      s.phase = 'pick';
      await btn.update({
        embeds: [baseEmbed().setTitle('الرولات التفاعلية').setDescription(`صفحة ${s.page + 1}`)],
        components: buildPickComponents(s, guild),
      });
      return;
    }
    if (btn.customId === 'iroles:next') {
      s.page += 1;
      s.phase = 'pick';
      await btn.update({
        embeds: [baseEmbed().setTitle('الرولات التفاعلية').setDescription(`صفحة ${s.page + 1}`)],
        components: buildPickComponents(s, guild),
      });
      return;
    }
    if (btn.customId === 'iroles:backcfg' && s.selectedRoleId) {
      const role = guild.roles.cache.get(s.selectedRoleId);
      await btn.update({
        embeds: [
          baseEmbed()
            .setTitle(`إعداد: ${role?.name ?? s.selectedRoleId}`)
            .setDescription('اضبط الصلاحيات.'),
        ],
        components: buildConfigureComponents(s),
      });
      return;
    }
    if (btn.customId === 'iroles:cmds' && s.selectedRoleId) {
      await btn.update({
        embeds: [baseEmbed().setTitle('أوامر الإدارة المسموحة')],
        components: buildCmdSelect(s),
      });
      return;
    }
    if (btn.customId.startsWith('iroles:t:') && s.selectedRoleId) {
      const key = btn.customId.slice('iroles:t:'.length);
      const d = s.drafts.get(s.selectedRoleId) ?? defaultDraft();
      if (key === 'attach') d.attachFiles = !d.attachFiles;
      if (key === 'mention') d.mentionEveryone = !d.mentionEveryone;
      if (key === 'stream') d.stream = !d.stream;
      if (key === 'mute') d.muteMembers = !d.muteMembers;
      if (key === 'deafen') d.deafenMembers = !d.deafenMembers;
      s.drafts.set(s.selectedRoleId, d);
      const role = guild.roles.cache.get(s.selectedRoleId);
      await btn.update({
        embeds: [
          baseEmbed()
            .setTitle(`إعداد: ${role?.name ?? s.selectedRoleId}`)
            .setDescription('تم تحديث الإعداد.'),
        ],
        components: buildConfigureComponents(s),
      });
      return;
    }
    if (btn.customId === 'iroles:nextrole') {
      s.phase = 'pick';
      s.selectedRoleId = null;
      await btn.update({
        embeds: [
          baseEmbed()
            .setTitle('الرولات التفاعلية')
            .setDescription('اختر الرول التالي من القائمة.'),
        ],
        components: buildPickComponents(s, guild),
      });
      return;
    }
    if (btn.customId === 'iroles:done') {
      await btn.deferUpdate();
      await applyDrafts(guild, s);
      sessions.delete(panel.id);
      await panel.edit({
        embeds: [successEmbed(`تم حفظ ${s.drafts.size} رول تفاعلي وتطبيق الصلاحيات.`)],
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

export async function getInteractiveAllowedCommands(
  guildId: string,
  roleIds: string[],
): Promise<Set<string>> {
  if (!roleIds.length) return new Set();
  const rows = await prisma.interactiveRole.findMany({
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
