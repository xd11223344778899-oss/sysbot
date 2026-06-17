import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type NonThreadGuildBasedChannel,
  type PermissionsBitField,
} from 'discord.js';
import { prisma } from '../database/prisma.js';
import { getGuildConfig } from '../database/guild-config.js';
import { logger } from '../logger.js';

/** Text channels: block writing only — never voice speaking. */
export const TEXT_MUTE_TEXT_DENY = {
  SendMessages: false,
  SendMessagesInThreads: false,
  CreatePublicThreads: false,
  CreatePrivateThreads: false,
  AddReactions: false,
  SendVoiceMessages: false,
} as const;

/** Voice / stage: block integrated text chat only. */
export const TEXT_MUTE_VOICE_DENY = {
  SendMessages: false,
  SendVoiceMessages: false,
} as const;

/**
 * Clears legacy voice denies (e.g. Speak from old setup).
 * Discord merge-edit keeps old denies unless explicitly nulled.
 */
export const TEXT_MUTE_VOICE_RESET = {
  Speak: null,
  Connect: null,
  UseVAD: null,
  Stream: null,
  UseEmbeddedActivities: null,
  PrioritySpeaker: null,
} as const;

export function channelAcceptsTextMuteOverwrite(
  channel: GuildBasedChannel,
): channel is NonThreadGuildBasedChannel & { permissionOverwrites: NonNullable<unknown> } {
  if (!('permissionOverwrites' in channel)) return false;
  return (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildAnnouncement ||
    channel.type === ChannelType.GuildVoice ||
    channel.type === ChannelType.GuildStageVoice ||
    channel.type === ChannelType.GuildForum ||
    channel.type === ChannelType.GuildMedia
  );
}

function isVoiceLikeChannel(channel: GuildBasedChannel): boolean {
  return channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice;
}

export function buildTextMuteOverwrite(channel: GuildBasedChannel): Record<string, boolean | null> {
  const deny = isVoiceLikeChannel(channel) ? TEXT_MUTE_VOICE_DENY : TEXT_MUTE_TEXT_DENY;
  return { ...deny, ...TEXT_MUTE_VOICE_RESET };
}

export function channelTextMuteOverwriteNeedsFix(
  channel: GuildBasedChannel,
  mutedRoleId: string,
): boolean {
  if (!channelAcceptsTextMuteOverwrite(channel)) return false;
  const ow = channel.permissionOverwrites.cache.get(mutedRoleId);
  if (!ow) return true;
  return !textMuteOverwriteIsCorrect(ow, isVoiceLikeChannel(channel));
}

function textMuteOverwriteIsCorrect(
  ow: { deny: Readonly<PermissionsBitField> },
  voiceLike: boolean,
): boolean {
  const deny = ow.deny;
  if (deny.has(PermissionFlagsBits.Speak)) return false;
  if (!deny.has(PermissionFlagsBits.SendMessages)) return false;
  if (voiceLike) {
    if (deny.has(PermissionFlagsBits.Connect)) return false;
    return true;
  }
  if (!deny.has(PermissionFlagsBits.SendMessagesInThreads)) return false;
  if (!deny.has(PermissionFlagsBits.AddReactions)) return false;
  return true;
}

export type TextMuteApplyResult = 'applied' | 'fixed' | 'unchanged' | 'skipped';

export async function applyTextMuteOverwriteToChannel(
  channel: GuildBasedChannel,
  mutedRoleId: string,
  exempt = false,
): Promise<TextMuteApplyResult> {
  if (!channelAcceptsTextMuteOverwrite(channel)) return 'skipped';
  try {
    if (exempt) {
      const had = channel.permissionOverwrites.cache.has(mutedRoleId);
      await channel.permissionOverwrites.delete(mutedRoleId).catch(() => {});
      return had ? 'fixed' : 'unchanged';
    }
    const needsFix = channelTextMuteOverwriteNeedsFix(channel, mutedRoleId);
    if (!needsFix) return 'unchanged';
    const had = channel.permissionOverwrites.cache.has(mutedRoleId);
    await channel.permissionOverwrites.edit(mutedRoleId, buildTextMuteOverwrite(channel));
    return had ? 'fixed' : 'applied';
  } catch (err) {
    logger.warn({ err, channelId: channel.id }, 'Failed text-mute overwrite on channel');
    return 'skipped';
  }
}

export interface ApplyTextMuteOptions {
  logCategoryId?: string | null;
}

export interface TextMuteOverwriteStats {
  applied: number;
  fixed: number;
  unchanged: number;
  skipped: number;
}

export async function applyTextMuteOverwritesToGuild(
  guild: Guild,
  mutedRoleId: string,
  options: ApplyTextMuteOptions = {},
): Promise<TextMuteOverwriteStats> {
  await guild.channels.fetch().catch(() => {});
  const blacklisted = await prisma.blacklistChat.findMany({ where: { guildId: guild.id } });
  const exempt = new Set(blacklisted.map((b) => b.channelId));
  const stats: TextMuteOverwriteStats = { applied: 0, fixed: 0, unchanged: 0, skipped: 0 };

  for (const channel of guild.channels.cache.values()) {
    if (!channelAcceptsTextMuteOverwrite(channel)) continue;
    if (exempt.has(channel.id)) continue;
    if (options.logCategoryId && channel.parentId === options.logCategoryId) continue;
    const result = await applyTextMuteOverwriteToChannel(channel, mutedRoleId, false);
    if (result === 'applied') stats.applied += 1;
    else if (result === 'fixed') stats.fixed += 1;
    else if (result === 'unchanged') stats.unchanged += 1;
    else stats.skipped += 1;
  }
  return stats;
}

export async function syncTextMuteOnChannelCreate(channel: GuildBasedChannel): Promise<void> {
  if (!('guild' in channel) || channel.isDMBased()) return;
  const cfg = await getGuildConfig(channel.guild.id);
  if (!cfg.mutedRoleId || !cfg.setupDone) return;

  const blacklisted = await prisma.blacklistChat.findUnique({
    where: { guildId_channelId: { guildId: channel.guild.id, channelId: channel.id } },
  });
  if (blacklisted) return;
  if (cfg.logCategory && channel.parentId === cfg.logCategory) return;

  await applyTextMuteOverwriteToChannel(channel, cfg.mutedRoleId, false);
}
