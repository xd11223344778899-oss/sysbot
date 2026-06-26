import type { GuildMember } from 'discord.js';
import type { PenaltyType } from '../shared/enums.js';
import { prisma } from '../database/prisma.js';
import { getGuildConfig } from '../database/guild-config.js';
import { logger } from '../logger.js';
import { markVmuteLifted } from './vmute-guard.js';
import { canModerate } from './mod-hierarchy.js';
import { stashVoiceCommandLogContext } from './voice-log-context.js';

const ROLE_KEY: Partial<
  Record<PenaltyType, 'mutedRoleId' | 'prisonRoleId' | 'blacklistedRoleId'>
> = {
  MUTE: 'mutedRoleId',
  PRISON: 'prisonRoleId',
  BLACKLIST: 'blacklistedRoleId',
};

export interface ApplyPenaltyInput {
  member: GuildMember;
  type: PenaltyType;
  moderatorId: string;
  moderator?: GuildMember;
  reason?: string;
  expiresAt?: Date | null;
}

/** Applies a penalty, records it, and schedules expiry if needed. VMUTE uses server mute only. */
export async function applyPenalty({
  member,
  type,
  moderatorId,
  moderator,
  reason,
  expiresAt,
}: ApplyPenaltyInput) {
  const guildId = member.guild.id;

  if (moderator) {
    const hierarchy = await canModerate(moderator, member);
    if (!hierarchy.allowed) throw new Error(`HIERARCHY:${hierarchy.reason ?? 'denied'}`);
  }

  const exempt = await prisma.exemption.findUnique({
    where: { guildId_userId_type: { guildId, userId: member.id, type } },
  });
  if (exempt) {
    throw new Error('EXEMPT');
  }

  if (type === 'VMUTE') {
    if (member.voice.channel) {
      try {
        await member.voice.setMute(true, reason ?? 'SysBot vmute');
      } catch {
        throw new Error('VMUTE_FAILED');
      }
    }
  } else if (type === 'MUTE' || type === 'PRISON' || type === 'BLACKLIST') {
    const cfg = await getGuildConfig(guildId);
    const roleKey = ROLE_KEY[type];
    if (!roleKey) throw new Error('ROLE_NOT_CONFIGURED');
    const roleId = cfg[roleKey];
    if (!roleId) throw new Error('ROLE_NOT_CONFIGURED');
    const auditReason =
      type === 'MUTE'
        ? reason ?? 'SysBot: إسكات كتابي'
        : type === 'PRISON'
          ? reason ?? 'SysBot: سجن'
          : reason ?? 'SysBot: بلاك لست';
    await member.roles.add(roleId, auditReason);
  } else {
    const cfg = await getGuildConfig(guildId);
    const roleKey = ROLE_KEY[type];
    if (roleKey) {
      const roleId = cfg[roleKey];
      if (!roleId) throw new Error('ROLE_NOT_CONFIGURED');
      await member.roles.add(roleId, reason ?? undefined);
    }
  }

  const penalty = await prisma.penalty.create({
    data: { guildId, userId: member.id, type, moderatorId, reason, expiresAt: expiresAt ?? null },
  });

  if (type === 'VMUTE') {
    stashVoiceCommandLogContext({
      guildId,
      userId: member.id,
      moderatorId,
      reason,
      expiresAt: expiresAt ?? null,
      action: 'mute',
    });
  }

  logger.info({ guildId, userId: member.id, type }, 'Penalty applied');
  return penalty;
}

/** Lifts the latest active penalty of a type for a user. */
export async function liftPenalty(
  guildId: string,
  member: GuildMember,
  type: PenaltyType,
  liftedById: string,
): Promise<boolean> {
  const active = await prisma.penalty.findFirst({
    where: { guildId, userId: member.id, type, active: true },
    orderBy: { createdAt: 'desc' },
  });

  if (type === 'VMUTE') {
    if (active) {
      stashVoiceCommandLogContext({
        guildId,
        userId: member.id,
        moderatorId: liftedById,
        reason: active.reason,
        expiresAt: active.expiresAt,
        action: 'unmute',
      });
    }
    markVmuteLifted(member.id);
    if (member.voice.channel) {
      await member.voice.setMute(false).catch(() => {});
    }
  } else {
    const cfg = await getGuildConfig(guildId);
    const roleKey = ROLE_KEY[type];
    if (roleKey) {
      const roleId = cfg[roleKey];
      if (roleId) await member.roles.remove(roleId).catch(() => {});
    }
  }

  if (!active) return false;

  await prisma.penalty.update({
    where: { id: active.id },
    data: { active: false, liftedAt: new Date(), liftedById },
  });
  return true;
}

export async function canLift(
  guildId: string,
  userId: string,
  moderatorId: string,
): Promise<boolean> {
  const cfg = await getGuildConfig(guildId);
  if (!cfg.punishOnlyAdmin) return true;
  if (userId === moderatorId) return true;
  const perm = await prisma.punishPerm.findUnique({
    where: { guildId_userId: { guildId, userId } },
  });
  return Boolean(perm);
}

export async function getUserPenalties(guildId: string, userId: string) {
  return prisma.penalty.findMany({
    where: { guildId, userId },
    orderBy: { createdAt: 'desc' },
  });
}
