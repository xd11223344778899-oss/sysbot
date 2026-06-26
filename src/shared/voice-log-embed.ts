import { EmbedBuilder } from 'discord.js';
import { type VoiceLogIconKey, getVoiceLogIconUrl } from './log-assets.js';
import { formatVoiceLogTime } from './log-time.js';
import { channelMention, mentionOnly } from './log-embed.js';

export const VOICE_LOG_COLOR = 0x5865f2;

export type VoiceLogKind =
  | 'mute'
  | 'unmute'
  | 'deafen'
  | 'undeafen'
  | 'join'
  | 'leave'
  | 'change'
  | 'move'
  | 'disconnect'
  | 'selfMute'
  | 'selfDeafen';

const TITLES: Record<VoiceLogKind, string> = {
  mute: 'Mute Member',
  unmute: 'UnMute Member',
  deafen: 'Deafen Member',
  undeafen: 'UnDeafed Member',
  join: 'Join Channel',
  leave: 'Leave Channel',
  change: 'Change Channel',
  move: 'Move Members',
  disconnect: 'Disconnect Members',
  selfMute: 'Self Mute',
  selfDeafen: 'Self Deafen',
};

const ICON_KEYS: Record<VoiceLogKind, VoiceLogIconKey> = {
  mute: 'mute',
  unmute: 'unmute',
  deafen: 'deafen',
  undeafen: 'undeafen',
  join: 'join',
  leave: 'leave',
  change: 'change',
  move: 'move',
  disconnect: 'disconnect',
  selfMute: 'selfMute',
  selfDeafen: 'selfDeaf',
};

const ACTION_AT_LABELS: Partial<Record<VoiceLogKind, string>> = {
  mute: 'Mute At',
  unmute: 'Un Mute At',
  deafen: 'Deafen At',
  undeafen: 'Un Deafen At',
};

export interface VoiceLogParticipant {
  id: string;
  tag?: string;
  displayName?: string;
  avatarUrl?: string | null;
}

export interface VoiceLogChannelRef {
  id: string;
  name: string;
}

export interface VoiceLogEmbedInput {
  kind: VoiceLogKind;
  actor: VoiceLogParticipant;
  target: VoiceLogParticipant;
  channel?: VoiceLogChannelRef | null;
  source: 'command' | 'manual' | 'self';
  reason?: string | null;
  actionAt?: Date | null;
  occurredAt?: Date;
  botFooter?: { name: string; iconUrl?: string | null };
}

function displayName(p: VoiceLogParticipant): string {
  return p.displayName ?? p.tag ?? p.id;
}

export function buildVoiceLogEmbed(input: VoiceLogEmbedInput): EmbedBuilder {
  const lines: string[] = [
    `To : ${mentionOnly(input.target.id)}`,
    `By : ${mentionOnly(input.actor.id)}`,
  ];

  if (input.channel) {
    lines.push(`In : ${channelMention(input.channel.id)}`);
  }

  if (input.source === 'command' && input.reason?.trim()) {
    lines.push(`Reason : ${input.reason.trim()}`);
  }

  const atLabel = ACTION_AT_LABELS[input.kind];
  if (input.source === 'command' && atLabel && input.actionAt) {
    lines.push(`${atLabel} : ${formatVoiceLogTime(input.actionAt)}`);
  }

  const thumb = getVoiceLogIconUrl(ICON_KEYS[input.kind]);
  const occurredAt = input.occurredAt ?? new Date();

  const embed = new EmbedBuilder()
    .setColor(VOICE_LOG_COLOR)
    .setAuthor({
      name: displayName(input.actor),
      iconURL: input.actor.avatarUrl ?? undefined,
    })
    .setTitle(TITLES[input.kind])
    .setDescription(lines.join('\n'))
    .setTimestamp(occurredAt);

  if (thumb) embed.setThumbnail(thumb);

  if (input.botFooter) {
    embed.setFooter({
      text: input.botFooter.name,
      iconURL: input.botFooter.iconUrl ?? undefined,
    });
  }

  return embed;
}
