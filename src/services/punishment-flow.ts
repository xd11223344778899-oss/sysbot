import {
  ActionRowBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type GuildMember,
  type MessageComponentInteraction,
  type ModalSubmitInteraction,
  type Message,
} from 'discord.js';
import type { PenaltyType } from '../shared/enums.js';
import { baseEmbed, errorEmbed, successEmbed } from '../shared/embeds.js';
import {
  filterReasonsForType,
  formatDurationMs,
  getPunishReasons,
} from '../services/punish-reasons-service.js';
import { applyPenalty } from '../services/penalty-service.js';
import { schedulePenaltyExpiry } from '../services/penalty-scheduler.js';
import { logModerationAction } from '../services/log-service.js';
import { LOG_COLORS } from '../shared/log-embed.js';
import { getGuildConfig } from '../database/guild-config.js';
import type { PunishReason } from '../shared/punish-reasons.js';

export type FlowPenaltyType = PenaltyType | 'KICK';

const FLOW_TYPES = new Set<string>(['MUTE', 'PRISON', 'VMUTE', 'BAN', 'KICK']);

function typeLabel(type: FlowPenaltyType): string {
  const labels: Record<string, string> = {
    MUTE: 'إسكات',
    PRISON: 'سجن',
    VMUTE: 'كتم صوتي',
    BAN: 'حظر',
    KICK: 'طرد',
  };
  return labels[type] ?? type;
}

export function hasManualPunishArgs(rest: string, arg0?: string): boolean {
  if (!arg0) return false;
  let tail = rest.slice(arg0.length).trim();
  if (!tail) return false;
  const first = tail.split(/\s+/)[0];
  if (/^\d+\s*(s|m|h|d|w)?$/i.test(first)) {
    tail = tail.slice(first.length).trim();
  }
  return tail.length > 0;
}

export async function startPunishmentFlow(
  message: Message<true>,
  type: FlowPenaltyType,
  target: GuildMember,
  moderator: GuildMember,
): Promise<void> {
  const reasons = filterReasonsForType(await getPunishReasons(message.guildId), type);
  const options = reasons.slice(0, 24).map((r) => ({
    label: r.label.slice(0, 100),
    description: formatDurationMs(r.durationMs).slice(0, 100),
    value: r.id,
  }));
  options.push({ label: 'سبب مخصص', description: 'إدخال يدوي', value: 'custom' });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`punish:sel:${type}:${target.id}:${moderator.id}`)
    .setPlaceholder('اختر سبب العقوبة')
    .addOptions(options);

  await message.reply({
    embeds: [
      baseEmbed()
        .setTitle(`${typeLabel(type)} — ${target.user.tag}`)
        .setDescription('اختر سبب العقوبة من القائمة.'),
    ],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  });
}

async function logFlowAction(
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
  type: FlowPenaltyType,
  target: GuildMember,
  moderator: GuildMember,
  reason: string,
  durationMs: number | null,
  channelId?: string,
): Promise<void> {
  const duration =
    durationMs && type !== 'KICK' && type !== 'BAN'
      ? ` — المدة: ${formatDurationMs(durationMs)}`
      : '';
  await logModerationAction(interaction.client, target.guild.id, {
    title: typeLabel(type),
    moderatorId: moderator.id,
    targetId: target.id,
    targetTag: target.user.tag,
    reason: reason || undefined,
    channelId,
    event: `تم تنفيذ ${typeLabel(type)}${duration}.`,
    color: type === 'KICK' || type === 'BAN' ? LOG_COLORS.danger : LOG_COLORS.info,
  });
}

async function executeFlowPenalty(
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
  type: FlowPenaltyType,
  target: GuildMember,
  moderator: GuildMember,
  reason: string,
  durationMs: number | null,
): Promise<void> {
  const guild = target.guild;
  const channelId = interaction.channelId ?? undefined;

  if (type === 'KICK') {
    if (!target.kickable) {
      if (interaction.isModalSubmit()) {
        await interaction.editReply({ embeds: [errorEmbed('لا أستطيع طرد هذا العضو.')] });
      } else {
        await interaction.editReply({ embeds: [errorEmbed('لا أستطيع طرد هذا العضو.')] });
      }
      return;
    }
    await target.kick(reason || undefined);
    await logFlowAction(interaction, type, target, moderator, reason, durationMs, channelId);
    const embed = successEmbed(`تم طرد ${target.user.tag}.`);
    if (interaction.isModalSubmit()) await interaction.editReply({ embeds: [embed] });
    else await interaction.editReply({ embeds: [embed], components: [] });
    return;
  }

  if (type === 'BAN') {
    if (!target.bannable) {
      const embed = errorEmbed('لا أستطيع حظر هذا العضو.');
      if (interaction.isModalSubmit()) await interaction.editReply({ embeds: [embed] });
      else await interaction.editReply({ embeds: [embed], components: [] });
      return;
    }
    const cfg = await getGuildConfig(guild.id);
    await target.ban({ reason: reason || cfg.banMessage || undefined });
    await logFlowAction(interaction, type, target, moderator, reason, durationMs, channelId);
    const embed = successEmbed(`تم حظر ${target.user.tag}.`);
    if (interaction.isModalSubmit()) await interaction.editReply({ embeds: [embed] });
    else await interaction.editReply({ embeds: [embed], components: [] });
    return;
  }

  const expiresAt = durationMs ? new Date(Date.now() + durationMs) : null;
  try {
    const penalty = await applyPenalty({
      member: target,
      type: type as PenaltyType,
      moderatorId: moderator.id,
      reason,
      expiresAt,
    });
    if (expiresAt) {
      schedulePenaltyExpiry(interaction.client, penalty.id, expiresAt);
    }
    await logFlowAction(interaction, type, target, moderator, reason, durationMs, channelId);
    const when = expiresAt ? ` لمدة ${formatDurationMs(durationMs)}` : '';
    const embed = successEmbed(`تم ${typeLabel(type)} ${target}${when}.`);
    if (interaction.isModalSubmit()) await interaction.editReply({ embeds: [embed] });
    else await interaction.editReply({ embeds: [embed], components: [] });
  } catch (err) {
    const code = (err as Error).message;
    let text = 'تعذّر تنفيذ العقوبة.';
    if (code === 'ROLE_NOT_CONFIGURED') text = 'شغّل الإعداد الأولي (lsetup) أولاً.';
    else if (code === 'EXEMPT') text = 'هذا العضو لديه استثناء من هذه العقوبة.';
    else if (code === 'VMUTE_FAILED') text = 'تعذّر تطبيق كتم الصوت. تحقق من صلاحيات البوت.';
    const embed = errorEmbed(text);
    if (interaction.isModalSubmit()) await interaction.editReply({ embeds: [embed] });
    else await interaction.editReply({ embeds: [embed], components: [] });
  }
}

function findReason(reasons: PunishReason[], id: string): PunishReason | undefined {
  return reasons.find((r) => r.id === id);
}

export async function handlePunishmentInteraction(
  interaction: MessageComponentInteraction | ModalSubmitInteraction,
): Promise<boolean> {
  if (!interaction.guild) return false;
  const customId = interaction.customId;
  if (!customId.startsWith('punish:')) return false;

  if (interaction.isStringSelectMenu() && customId.startsWith('punish:sel:')) {
    const [, , type, targetId, modId] = customId.split(':');
    if (!FLOW_TYPES.has(type) || interaction.user.id !== modId) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ embeds: [errorEmbed('غير مصرح.')], ephemeral: true });
      }
      return true;
    }
    const value = interaction.values[0];
    const target = await interaction.guild.members.fetch(targetId).catch(() => null);
    const moderator = await interaction.guild.members.fetch(modId).catch(() => null);
    if (!target || !moderator) {
      await interaction.update({ embeds: [errorEmbed('العضو غير موجود.')], components: [] });
      return true;
    }

    if (value === 'custom') {
      const modal = new ModalBuilder()
        .setCustomId(`punish:modal:${type}:${targetId}:${modId}`)
        .setTitle('سبب مخصص');
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('السبب')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('duration')
            .setLabel('المدة (30m / 2h / فارغ=دائمة)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(20),
        ),
      );
      await interaction.showModal(modal);
      return true;
    }

    await interaction.deferUpdate();
    const reasons = await getPunishReasons(interaction.guild.id);
    const picked = findReason(filterReasonsForType(reasons, type as FlowPenaltyType), value);
    if (!picked) {
      await interaction.editReply({ embeds: [errorEmbed('السبب غير موجود.')], components: [] });
      return true;
    }
    await executeFlowPenalty(
      interaction,
      type as FlowPenaltyType,
      target,
      moderator,
      picked.label,
      picked.durationMs,
    );
    return true;
  }

  if (interaction.isModalSubmit() && customId.startsWith('punish:modal:')) {
    const [, , type, targetId, modId] = customId.split(':');
    if (!FLOW_TYPES.has(type) || interaction.user.id !== modId) {
      await interaction.reply({ embeds: [errorEmbed('غير مصرح.')], ephemeral: true });
      return true;
    }
    await interaction.deferReply({ ephemeral: true });
    const target = await interaction.guild.members.fetch(targetId).catch(() => null);
    const moderator = await interaction.guild.members.fetch(modId).catch(() => null);
    if (!target || !moderator) {
      await interaction.editReply({ embeds: [errorEmbed('العضو غير موجود.')] });
      return true;
    }
    const reason = interaction.fields.getTextInputValue('reason').trim();
    const durRaw = interaction.fields.getTextInputValue('duration')?.trim();
    let durationMs: number | null = null;
    if (durRaw) {
      const match = durRaw.match(/^(\d+)\s*(s|m|h|d|w)?$/i);
      if (match) {
        const n = Number(match[1]);
        const u = (match[2] ?? 'm').toLowerCase();
        const mult: Record<string, number> = {
          s: 1000,
          m: 60_000,
          h: 3_600_000,
          d: 86_400_000,
          w: 604_800_000,
        };
        durationMs = n * mult[u];
      }
    }
    await executeFlowPenalty(interaction, type as FlowPenaltyType, target, moderator, reason, durationMs);
    return true;
  }

  return false;
}
