import {
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type NonThreadGuildBasedChannel,
} from 'discord.js';
import { prisma } from '../database/prisma.js';
import { getGuildConfig } from '../database/guild-config.js';
import { logger } from '../logger.js';
import { applyTextMuteOverwriteToChannel } from './text-mute-overwrites.js';
import { applyUnverifiedOverwriteToChannel } from './verify-overwrites.js';
import { isRestrictedChannel, type RestrictedChannelIds } from './restricted-channels.js';
import {
  decorRoleIdsFromContext,
  EVERYONE_CHANNEL_RESET,
} from './role-permission-matrix.js';

export interface ChannelPermissionContext {
  mutedRoleId: string | null;
  prisonRoleId: string | null;
  blacklistedRoleId: string | null;
  picRoleId: string | null;
  hereRoleId: string | null;
  liveRoleId: string | null;
  unverifiedRoleId: string | null;
  verifyChannelId: string | null;
  verifyEnabled: boolean;
  restricted: RestrictedChannelIds | null;
  logCategoryId: string | null;
  decorBaselineEnabled: boolean;
}

export type PermApplyResult = 'applied' | 'fixed' | 'unchanged' | 'skipped';

export interface PermSyncStats {
  applied: number;
  fixed: number;
  unchanged: number;
  skipped: number;
}

function emptyStats(): PermSyncStats {
  return { applied: 0, fixed: 0, unchanged: 0, skipped: 0 };
}

function bump(stats: PermSyncStats, result: PermApplyResult): void {
  if (result === 'applied') stats.applied += 1;
  else if (result === 'fixed') stats.fixed += 1;
  else if (result === 'unchanged') stats.unchanged += 1;
  else stats.skipped += 1;
}

export function channelAcceptsOverwrites(
  channel: GuildBasedChannel,
): channel is NonThreadGuildBasedChannel {
  return 'permissionOverwrites' in channel;
}

const EVERYONE_DECOR_FLAGS = [
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.Stream,
  PermissionFlagsBits.UseEmbeddedActivities,
] as const;

export async function buildPermissionContext(guildId: string): Promise<ChannelPermissionContext> {
  const cfg = await getGuildConfig(guildId);
  const restricted =
    cfg.restrictedCategoryId &&
    cfg.blackChannelId &&
    cfg.blackVoiceId &&
    cfg.prisonChannelId &&
    cfg.prisonVoiceId
      ? {
          restrictedCategoryId: cfg.restrictedCategoryId,
          blackChannelId: cfg.blackChannelId,
          blackVoiceId: cfg.blackVoiceId,
          prisonChannelId: cfg.prisonChannelId,
          prisonVoiceId: cfg.prisonVoiceId,
        }
      : null;

  return {
    mutedRoleId: cfg.mutedRoleId,
    prisonRoleId: cfg.prisonRoleId,
    blacklistedRoleId: cfg.blacklistedRoleId,
    picRoleId: cfg.picRoleId,
    hereRoleId: cfg.hereRoleId,
    liveRoleId: cfg.liveRoleId,
    unverifiedRoleId: cfg.unverifiedRoleId,
    verifyChannelId: cfg.verifyChannelId,
    verifyEnabled: cfg.verifyEnabled,
    restricted,
    logCategoryId: cfg.logCategory,
    decorBaselineEnabled: cfg.decorBaselineEnabled,
  };
}

async function isBlacklistedChat(guildId: string, channelId: string): Promise<boolean> {
  const row = await prisma.blacklistChat.findUnique({
    where: { guildId_channelId: { guildId, channelId } },
  });
  return Boolean(row);
}

function shouldSkipChannel(
  channel: GuildBasedChannel,
  ctx: ChannelPermissionContext,
  blacklistedChat: boolean,
): boolean {
  if (!channelAcceptsOverwrites(channel)) return true;
  if (blacklistedChat) return true;
  if (ctx.logCategoryId && channel.parentId === ctx.logCategoryId) return true;
  if (ctx.restricted && isRestrictedChannel(channel, ctx.restricted)) return true;
  return false;
}

async function applyOverwrite(
  channel: NonThreadGuildBasedChannel,
  roleId: string,
  allow: Record<string, boolean | null> | null,
  deny: Record<string, boolean | null> | null,
): Promise<PermApplyResult> {
  try {
    const had = channel.permissionOverwrites.cache.has(roleId);
    const payload: Record<string, boolean | null> = {};
    if (allow) {
      for (const [key, value] of Object.entries(allow)) {
        if (value !== null) payload[key] = value;
      }
    }
    if (deny) {
      for (const [key, value] of Object.entries(deny)) {
        if (value !== null) payload[key] = value;
      }
    }
    if (Object.keys(payload).length === 0) return 'unchanged';
    await channel.permissionOverwrites.edit(roleId, payload);
    return had ? 'fixed' : 'applied';
  } catch (err) {
    logger.warn({ err, channelId: channel.id, roleId }, 'overwrite apply failed');
    return 'skipped';
  }
}

/** Reset legacy @everyone decor denies in channels — policy is guild-level only. */
export async function cleanupEveryoneDecorOverwrites(
  channel: GuildBasedChannel,
): Promise<PermApplyResult> {
  if (!channelAcceptsOverwrites(channel)) return 'skipped';
  const everyoneId = channel.guild.roles.everyone.id;
  const ow = channel.permissionOverwrites.cache.get(everyoneId);
  if (!ow) return 'unchanged';
  const needsReset = EVERYONE_DECOR_FLAGS.some(
    (flag) => ow.deny.has(flag) || ow.allow.has(flag),
  );
  if (!needsReset) return 'unchanged';
  try {
    await channel.permissionOverwrites.edit(everyoneId, { ...EVERYONE_CHANNEL_RESET });
    return 'fixed';
  } catch (err) {
    logger.warn({ err, channelId: channel.id }, 'everyone decor cleanup failed');
    return 'skipped';
  }
}

/** Remove Pic/Here/Live channel overwrites left from older syncs. */
export async function cleanupStaleDecorOverwrites(
  channel: GuildBasedChannel,
  ctx: ChannelPermissionContext,
): Promise<PermApplyResult> {
  if (!channelAcceptsOverwrites(channel)) return 'skipped';
  let last: PermApplyResult = 'unchanged';
  for (const roleId of decorRoleIdsFromContext(ctx)) {
    if (!channel.permissionOverwrites.cache.has(roleId)) continue;
    try {
      await channel.permissionOverwrites.delete(roleId);
      last = 'fixed';
    } catch (err) {
      logger.warn({ err, channelId: channel.id, roleId }, 'stale decor cleanup failed');
      last = 'skipped';
    }
  }
  return last;
}

export async function applyPrisonOverwrite(
  channel: GuildBasedChannel,
  ctx: ChannelPermissionContext,
): Promise<PermApplyResult> {
  if (!ctx.prisonRoleId || !channelAcceptsOverwrites(channel)) return 'skipped';
  return applyOverwrite(channel, ctx.prisonRoleId, null, { ViewChannel: false });
}

export async function applyBlacklistedOverwrite(
  channel: GuildBasedChannel,
  ctx: ChannelPermissionContext,
): Promise<PermApplyResult> {
  if (!ctx.blacklistedRoleId || !channelAcceptsOverwrites(channel)) return 'skipped';
  return applyOverwrite(channel, ctx.blacklistedRoleId, null, { ViewChannel: false });
}

export async function applyAllOverwritesToChannel(
  channel: GuildBasedChannel,
  ctx: ChannelPermissionContext,
  blacklistedChat: boolean,
): Promise<PermSyncStats> {
  const stats = emptyStats();
  if (shouldSkipChannel(channel, ctx, blacklistedChat)) {
    stats.skipped += 1;
    return stats;
  }

  bump(stats, await cleanupEveryoneDecorOverwrites(channel));
  bump(stats, await cleanupStaleDecorOverwrites(channel, ctx));
  bump(stats, await applyPrisonOverwrite(channel, ctx));
  bump(stats, await applyBlacklistedOverwrite(channel, ctx));

  if (ctx.mutedRoleId) {
    const muteResult = await applyTextMuteOverwriteToChannel(channel, ctx.mutedRoleId, false);
    bump(stats, muteResult);
  }
  if (ctx.verifyEnabled && ctx.unverifiedRoleId && ctx.verifyChannelId) {
    const verifyResult = await applyUnverifiedOverwriteToChannel(
      channel,
      ctx.unverifiedRoleId,
      ctx.verifyChannelId,
    );
    bump(stats, verifyResult);
  }
  return stats;
}

export async function applyAllOverwritesToGuild(
  guild: Guild,
  ctx?: ChannelPermissionContext,
): Promise<PermSyncStats> {
  await guild.channels.fetch().catch(() => {});
  const permCtx = ctx ?? (await buildPermissionContext(guild.id));
  const blacklisted = await prisma.blacklistChat.findMany({ where: { guildId: guild.id } });
  const exempt = new Set(blacklisted.map((b) => b.channelId));
  const total = emptyStats();

  for (const channel of guild.channels.cache.values()) {
    const stats = await applyAllOverwritesToChannel(channel, permCtx, exempt.has(channel.id));
    total.applied += stats.applied;
    total.fixed += stats.fixed;
    total.unchanged += stats.unchanged;
    total.skipped += stats.skipped;
  }
  return total;
}

export async function syncAllOverwritesOnChannelCreate(channel: GuildBasedChannel): Promise<void> {
  if (!('guild' in channel) || channel.isDMBased()) return;
  const ctx = await buildPermissionContext(channel.guild.id);
  const blacklistedChat = await isBlacklistedChat(channel.guild.id, channel.id);
  await applyAllOverwritesToChannel(channel, ctx, blacklistedChat);
}

export function mergePermStats(into: PermSyncStats, from: PermSyncStats): void {
  into.applied += from.applied;
  into.fixed += from.fixed;
  into.unchanged += from.unchanged;
  into.skipped += from.skipped;
}

export function formatPermStats(label: string, stats: PermSyncStats): string {
  const parts = [`${stats.unchanged} سليمة`];
  if (stats.fixed) parts.push(`${stats.fixed} أُصلحت`);
  if (stats.applied) parts.push(`${stats.applied} أُضيفت`);
  return `${label}: ${parts.join('، ')}`;
}
