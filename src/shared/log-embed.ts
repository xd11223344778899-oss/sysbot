import { EmbedBuilder, type ColorResolvable } from 'discord.js';
import { PROTECTION_ALERT_THUMBNAIL_URL } from './log-assets.js';

export const LOG_COLORS = {
  success: 0x57f287,
  danger: 0xed4245,
  info: 0x5865f2,
  protection: 0x2d6a4f,
} as const;

export interface LogEmbedInput {
  /** عنوان الحدث (عربي). */
  title: string;
  color?: ColorResolvable;
  /** نص الحدث / التفاصيل — يظهر بعد الحقول. */
  event?: string;
  /** المنفّذ / المتسبب. */
  by?: string;
  /** المتأثر / الهدف. */
  to?: string;
  /** القناة (الوجهة أو السياق). */
  in?: string;
  /** القناة المصدر (انتقالات صوتية). */
  from?: string;
  reason?: string;
  /** وقت الحدث — افتراضي: الآن. */
  time?: Date | number;
  /** حقول إضافية اختيارية (قبل نص الحدث). */
  extra?: { name: string; value: string }[];
}

function formatTime(time: Date | number): string {
  const ms = time instanceof Date ? time.getTime() : time;
  return `<t:${Math.floor(ms / 1000)}:F>`;
}

/**
 * Builds a formal log embed. Only includes fields that are provided.
 * Layout: by / to / in / from / reason / time — then extra / event body.
 * `to` may be a member mention or a channel mention depending on the event.
 */
export function buildLogEmbed(input: LogEmbedInput): EmbedBuilder {
  const lines: string[] = [];
  if (input.by) lines.push(`**by:** ${input.by}`);
  if (input.to) lines.push(`**to:** ${input.to}`);
  if (input.in) lines.push(`**in:** ${input.in}`);
  if (input.from) lines.push(`**from:** ${input.from}`);
  if (input.reason) lines.push(`**reason:** ${input.reason}`);

  const at = input.time ?? Date.now();
  lines.push(`**time:** ${formatTime(at)}`);

  if (input.extra?.length) {
    lines.push('');
    for (const row of input.extra) {
      lines.push(`**${row.name}:** ${row.value}`);
    }
  }

  if (input.event) {
    if (lines.length) lines.push('');
    lines.push(input.event);
  }

  return new EmbedBuilder()
    .setColor(input.color ?? LOG_COLORS.info)
    .setTitle(input.title)
    .setDescription(lines.join('\n').slice(0, 4096))
    .setTimestamp(at instanceof Date ? at : new Date(at));
}

export function userMention(id: string, fallback?: string): string {
  return fallback ? `<@${id}> (${fallback})` : `<@${id}>`;
}

export function mentionOnly(id: string): string {
  return `<@${id}>`;
}

export function channelMention(id: string): string {
  return `<#${id}>`;
}

export interface ProtectionAlertInput {
  guildName: string;
  guildIconUrl?: string | null;
  targetId: string;
  /** e.g. "Was trying to delete a channel" */
  attemptText: string;
  /** Action taken by the bot — default: Remove user roles */
  responseText?: string;
  /** First line inside the code block */
  codeTitle: string;
  /** Second line inside the code block */
  codeDetail: string;
  /** Override default thumbnail from log-assets */
  thumbnailUrl?: string | null;
}

/** Protection Alert embed — matches log-protection layout. */
export function buildProtectionAlertEmbed(input: ProtectionAlertInput): EmbedBuilder {
  const thumb = input.thumbnailUrl ?? PROTECTION_ALERT_THUMBNAIL_URL;
  const embed = new EmbedBuilder()
    .setColor(LOG_COLORS.protection)
    .setAuthor({
      name: input.guildName,
      iconURL: input.guildIconUrl ?? undefined,
    })
    .setTitle('Protection Alert')
    .setDescription(
      [
        `To : ${mentionOnly(input.targetId)}`,
        input.attemptText,
        input.responseText ?? 'Remove user roles',
        '',
        '```',
        input.codeTitle,
        input.codeDetail,
        '```',
      ].join('\n'),
    )
    .setFooter({
      text: input.guildName,
      iconURL: input.guildIconUrl ?? undefined,
    });

  if (thumb) embed.setThumbnail(thumb);
  return embed;
}
