import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import { prisma } from '../database/prisma.js';
import { isOwner } from '../core/permission-engine.js';

export type AdminHierarchyStatus = 'allowed' | 'denied' | 'voice_consent_required';

export interface AdminHierarchyResult {
  status: AdminHierarchyStatus;
  reason?: string;
}

/** Lower rank number = higher admin tier (0 = top of aroles panel). null = not a registered admin. */
export async function getMemberAdminRank(
  guildId: string,
  member: GuildMember,
): Promise<number | null> {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return -1;

  const rows = await prisma.adminRole.findMany({
    where: { guildId },
    select: { roleId: true, sortOrder: true },
  });
  if (!rows.length) return null;

  const rankByRole = new Map(rows.map((r) => [r.roleId, r.sortOrder]));
  let best: number | null = null;
  for (const roleId of member.roles.cache.keys()) {
    const rank = rankByRole.get(roleId);
    if (rank !== undefined && (best === null || rank < best)) best = rank;
  }
  return best;
}

export async function isRegisteredAdmin(
  guildId: string,
  member: GuildMember,
): Promise<boolean> {
  return (await getMemberAdminRank(guildId, member)) !== null;
}

/** Pure rank comparison for tests and checkAdminHierarchy. */
export function resolveAdminHierarchyByRanks(
  modRank: number | null,
  targetRank: number | null,
  voiceMove: boolean,
): AdminHierarchyResult {
  if (targetRank === null) return { status: 'allowed' };

  if (modRank === null) {
    return {
      status: 'denied',
      reason: 'لا يمكنك تنفيذ إجراء على مشرف إداري مسجّل في النظام.',
    };
  }

  if (modRank > targetRank) {
    if (voiceMove) return { status: 'voice_consent_required' };
    return {
      status: 'denied',
      reason: 'لا يمكنك تنفيذ إجراء على مشرف أعلى منك في الترتيب الإداري.',
    };
  }

  if (modRank === targetRank) {
    if (voiceMove) return { status: 'voice_consent_required' };
    return {
      status: 'denied',
      reason: 'لا يمكنك تنفيذ إجراء على مشرف بنفس رتبتك الإدارية.',
    };
  }

  return { status: 'allowed' };
}

/**
 * Compare admin-role hierarchy (aroles panel order).
 * Weaker admins cannot act on stronger admins; voice move may require consent instead.
 */
export async function checkAdminHierarchy(
  moderator: GuildMember,
  target: GuildMember,
  options?: { voiceMove?: boolean },
): Promise<AdminHierarchyResult> {
  const guildId = moderator.guild.id;
  const voiceMove = options?.voiceMove ?? false;

  if (moderator.id === moderator.guild.ownerId) return { status: 'allowed' };
  if (await isOwner(guildId, moderator.id)) return { status: 'allowed' };

  const modRank = await getMemberAdminRank(guildId, moderator);
  const targetRank = await getMemberAdminRank(guildId, target);

  return resolveAdminHierarchyByRanks(modRank, targetRank, voiceMove);
}
