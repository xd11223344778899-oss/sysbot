import { ChannelType, PermissionFlagsBits, type Guild, type GuildMember } from 'discord.js';
import type { GuildConfig } from '../database/guild-config.js';
import { getGuildConfig } from '../database/guild-config.js';
import { prisma } from '../database/prisma.js';
import { NEW_CHANNEL_NAME, VERIFY_CHANNEL_NAME } from '../shared/constants.js';
import { applyUnverifiedOverwritesToGuild } from './verify-overwrites.js';
import { logger } from '../logger.js';

const DAY = 86_400_000;

function accountAgeDays(member: GuildMember): number {
  return (Date.now() - member.user.createdTimestamp) / DAY;
}

export async function ensureGateChannel(
  guild: Guild,
  name: string,
  roleId: string,
): Promise<string> {
  let channel = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === name,
  );
  if (!channel) {
    channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    });
  }
  return channel.id;
}

/** Hide every channel from a gating role except the allowed one (new-account gate). */
async function lockdownForRole(guild: Guild, roleId: string, exceptChannelId: string) {
  await guild.channels.fetch().catch(() => {});
  for (const channel of guild.channels.cache.values()) {
    if (channel.id === exceptChannelId) continue;
    if (!('permissionOverwrites' in channel)) continue;
    try {
      await channel.permissionOverwrites.edit(roleId, { ViewChannel: false });
    } catch {
      // ignore
    }
  }
}

/**
 * Runs all join-time gating: antijoin, new-account, verification, autorole.
 * Returns true if the member was removed (ban/kick), so callers can stop.
 */
export async function handleMemberJoin(member: GuildMember): Promise<boolean> {
  const guild = member.guild;
  const cfg = await getGuildConfig(guild.id);
  const ageDays = accountAgeDays(member);

  // antijoin: punish very new accounts.
  if (cfg.antijoinEnabled && ageDays < cfg.antijoinMinAgeDays) {
    if (cfg.antijoinAction === 'BAN') {
      await member.ban({ reason: 'antijoin: حساب جديد' }).catch(() => {});
      return true;
    }
    if (cfg.antijoinAction === 'KICK') {
      await member.kick('antijoin: حساب جديد').catch(() => {});
      return true;
    }
    if (cfg.antijoinAction === 'PRISON' && cfg.prisonRoleId) {
      await member.roles.add(cfg.prisonRoleId).catch(() => {});
    }
  }

  // antibots: kick joining bots.
  if (cfg.antiBots && member.user.bot) {
    await member.kick('antibots').catch(() => {});
    return true;
  }

  // Verification gate takes priority over the new-account gate.
  if (cfg.verifyEnabled && cfg.unverifiedRoleId) {
    const channelId =
      cfg.verifyChannelId ??
      (await ensureGateChannel(guild, VERIFY_CHANNEL_NAME, cfg.unverifiedRoleId));
    if (channelId !== cfg.verifyChannelId) {
      await prisma.guild.update({ where: { id: guild.id }, data: { verifyChannelId: channelId } });
    }
    await member.roles.add(cfg.unverifiedRoleId).catch(() => {});
    await applyUnverifiedOverwritesToGuild(guild, cfg.unverifiedRoleId, channelId);
    await postGateMessage(guild, channelId, cfg.verifyMessage ?? defaultVerifyMessage(member));
  } else if (cfg.newEnabled && ageDays < cfg.newMinAgeDays && cfg.newRoleId) {
    const channelId =
      cfg.newChannelId ?? (await ensureGateChannel(guild, NEW_CHANNEL_NAME, cfg.newRoleId));
    if (channelId !== cfg.newChannelId) {
      await prisma.guild.update({ where: { id: guild.id }, data: { newChannelId: channelId } });
    }
    await member.roles.add(cfg.newRoleId).catch(() => {});
    await lockdownForRole(guild, cfg.newRoleId, channelId);
    await postGateMessage(
      guild,
      channelId,
      cfg.newMessage ?? `عمر حسابك أقل من ${cfg.newMinAgeDays} يوم.`,
    );
  } else {
    // Normal join: apply auto-roles.
    if (cfg.autoRoleIds.length) {
      await member.roles.add(cfg.autoRoleIds).catch(() => {});
    }
  }

  return false;
}

export interface CompleteVerificationResult {
  removedUnverified: boolean;
  autorolesAdded: string[];
}

/** Remove Unverified and apply configured auto-roles (post-verification). */
export async function completeMemberVerification(
  member: GuildMember,
  cfg: Pick<GuildConfig, 'unverifiedRoleId' | 'autoRoleIds'>,
): Promise<CompleteVerificationResult> {
  const result: CompleteVerificationResult = { removedUnverified: false, autorolesAdded: [] };

  if (cfg.unverifiedRoleId && member.roles.cache.has(cfg.unverifiedRoleId)) {
    await member.roles.remove(cfg.unverifiedRoleId).catch(() => {});
    result.removedUnverified = true;
  }

  if (cfg.autoRoleIds.length) {
    const toAdd = cfg.autoRoleIds.filter((id) => !member.roles.cache.has(id));
    if (toAdd.length) {
      await member.roles.add(toAdd).catch(() => {});
      result.autorolesAdded = toAdd;
    }
  }

  return result;
}

export interface ReverseVerificationResult {
  restoredUnverified: boolean;
  autorolesRemoved: string[];
}

/** Re-apply Unverified and remove auto-roles granted on verification (reaction toggle off). */
export async function reverseMemberVerification(
  member: GuildMember,
  cfg: Pick<GuildConfig, 'unverifiedRoleId' | 'autoRoleIds'>,
): Promise<ReverseVerificationResult> {
  const result: ReverseVerificationResult = { restoredUnverified: false, autorolesRemoved: [] };

  if (cfg.unverifiedRoleId && !member.roles.cache.has(cfg.unverifiedRoleId)) {
    await member.roles.add(cfg.unverifiedRoleId).catch(() => {});
    result.restoredUnverified = true;
  }

  const toRemove = cfg.autoRoleIds.filter((id) => member.roles.cache.has(id));
  if (toRemove.length) {
    await member.roles.remove(toRemove).catch(() => {});
    result.autorolesRemoved = toRemove;
  }

  return result;
}

function defaultVerifyMessage(member: GuildMember): string {
  return `مرحباً ${member}، فعّل حسابك للدخول إلى السيرفر أو تواصل مع الإدارة.`;
}

async function postGateMessage(guild: Guild, channelId: string, content: string) {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel?.type === ChannelType.GuildText) {
    await channel.send(content).catch(() => {});
  } else {
    logger.warn({ guild: guild.id, channelId }, 'Gate channel missing');
  }
}
