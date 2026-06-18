import { prisma } from '../database/prisma.js';

export const BLOCK_ROLE_PREFIX = 'BLOCK_ROLE:';

export function encodeBlockReason(roleId?: string, userReason?: string): string | undefined {
  if (!roleId && !userReason) return undefined;
  const parts: string[] = [];
  if (roleId) parts.push(`${BLOCK_ROLE_PREFIX}${roleId}`);
  if (userReason) parts.push(userReason);
  return parts.join(' | ') || undefined;
}

export function parseBlockRoleId(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const match = reason.match(/BLOCK_ROLE:(\d{16,20})/);
  return match?.[1] ?? null;
}

/** True if member has active BLOCK preventing assignment of roleId (or any role if global). */
export async function isRoleBlockedForMember(
  guildId: string,
  userId: string,
  roleId: string,
): Promise<boolean> {
  const blocks = await prisma.penalty.findMany({
    where: { guildId, userId, type: 'BLOCK', active: true },
  });
  if (!blocks.length) return false;
  for (const b of blocks) {
    const blockedRole = parseBlockRoleId(b.reason);
    if (!blockedRole || blockedRole === roleId) return true;
  }
  return false;
}
