import {
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type NonThreadGuildBasedChannel,
  type PermissionsBitField,
} from 'discord.js';
import { getGuildConfig } from '../database/guild-config.js';
import { logger } from '../logger.js';

export const UNVERIFIED_VERIFY_ALLOW = {
  ViewChannel: true,
  SendMessages: true,
  ReadMessageHistory: true,
} as const;

export const UNVERIFIED_HIDE_DENY = {
  ViewChannel: false,
} as const;

export function channelAcceptsVerifyOverwrite(
  channel: GuildBasedChannel,
): channel is NonThreadGuildBasedChannel {
  return 'permissionOverwrites' in channel;
}

function verifyAllowOverwriteIsCorrect(ow: { allow: Readonly<PermissionsBitField> }): boolean {
  const allow = ow.allow;
  return (
    allow.has(PermissionFlagsBits.ViewChannel) &&
    allow.has(PermissionFlagsBits.SendMessages) &&
    allow.has(PermissionFlagsBits.ReadMessageHistory)
  );
}

function verifyDenyOverwriteIsCorrect(ow: { deny: Readonly<PermissionsBitField> }): boolean {
  return ow.deny.has(PermissionFlagsBits.ViewChannel);
}

export function channelUnverifiedOverwriteNeedsFix(
  channel: GuildBasedChannel,
  unverifiedRoleId: string,
  verifyChannelId: string,
): boolean {
  if (!channelAcceptsVerifyOverwrite(channel)) return false;
  const isVerify = channel.id === verifyChannelId;
  const ow = channel.permissionOverwrites.cache.get(unverifiedRoleId);
  if (!ow) return true;
  return isVerify ? !verifyAllowOverwriteIsCorrect(ow) : !verifyDenyOverwriteIsCorrect(ow);
}

export type VerifyApplyResult = 'applied' | 'fixed' | 'unchanged' | 'skipped';

export async function applyUnverifiedOverwriteToChannel(
  channel: GuildBasedChannel,
  unverifiedRoleId: string,
  verifyChannelId: string,
): Promise<VerifyApplyResult> {
  if (!channelAcceptsVerifyOverwrite(channel)) return 'skipped';
  const isVerify = channel.id === verifyChannelId;
  try {
    const needsFix = channelUnverifiedOverwriteNeedsFix(channel, unverifiedRoleId, verifyChannelId);
    if (!needsFix) return 'unchanged';
    const had = channel.permissionOverwrites.cache.has(unverifiedRoleId);
    if (isVerify) {
      await channel.permissionOverwrites.edit(unverifiedRoleId, UNVERIFIED_VERIFY_ALLOW);
    } else {
      await channel.permissionOverwrites.edit(unverifiedRoleId, UNVERIFIED_HIDE_DENY);
    }
    return had ? 'fixed' : 'applied';
  } catch (err) {
    logger.warn({ err, channelId: channel.id }, 'Failed unverified overwrite on channel');
    return 'skipped';
  }
}

export interface VerifyOverwriteStats {
  applied: number;
  fixed: number;
  unchanged: number;
  skipped: number;
}

export async function applyUnverifiedOverwritesToGuild(
  guild: Guild,
  unverifiedRoleId: string,
  verifyChannelId: string,
): Promise<VerifyOverwriteStats> {
  await guild.channels.fetch().catch(() => {});
  const stats: VerifyOverwriteStats = { applied: 0, fixed: 0, unchanged: 0, skipped: 0 };

  for (const channel of guild.channels.cache.values()) {
    const result = await applyUnverifiedOverwriteToChannel(channel, unverifiedRoleId, verifyChannelId);
    if (result === 'applied') stats.applied += 1;
    else if (result === 'fixed') stats.fixed += 1;
    else if (result === 'unchanged') stats.unchanged += 1;
    else stats.skipped += 1;
  }
  return stats;
}

export async function removeUnverifiedOverwritesFromGuild(
  guild: Guild,
  unverifiedRoleId: string,
): Promise<number> {
  await guild.channels.fetch().catch(() => {});
  let removed = 0;
  for (const channel of guild.channels.cache.values()) {
    if (!channelAcceptsVerifyOverwrite(channel)) continue;
    if (!channel.permissionOverwrites.cache.has(unverifiedRoleId)) continue;
    try {
      await channel.permissionOverwrites.delete(unverifiedRoleId);
      removed += 1;
    } catch (err) {
      logger.warn({ err, channelId: channel.id }, 'Failed removing unverified overwrite');
    }
  }
  return removed;
}

export async function syncVerifyOnChannelCreate(channel: GuildBasedChannel): Promise<void> {
  if (!('guild' in channel) || channel.isDMBased()) return;
  const cfg = await getGuildConfig(channel.guild.id);
  if (!cfg.verifyEnabled || !cfg.unverifiedRoleId || !cfg.verifyChannelId) return;
  await applyUnverifiedOverwriteToChannel(channel, cfg.unverifiedRoleId, cfg.verifyChannelId);
}

export function formatVerifyOverwriteStats(stats: VerifyOverwriteStats): string {
  const parts = [`${stats.unchanged} سليمة`];
  if (stats.fixed) parts.push(`${stats.fixed} أُصلحت`);
  if (stats.applied) parts.push(`${stats.applied} أُضيفت`);
  if (stats.skipped) parts.push(`${stats.skipped} تُخطّيت`);
  return parts.join('، ');
}
