import { prisma } from '../database/prisma.js';

const PROTECTED_ROLES_COLLECTION = 'protectedRoles';

export async function getProtectedRoleIds(guildId: string): Promise<Set<string>> {
  const row = await prisma.antiCollection.findUnique({
    where: { guildId_name: { guildId, name: PROTECTED_ROLES_COLLECTION } },
  });
  if (!row) return new Set();
  try {
    const parsed = JSON.parse(row.data) as unknown;
    if (Array.isArray(parsed)) {
      return new Set(parsed.map(String));
    }
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { roleIds?: unknown }).roleIds)) {
      return new Set((parsed as { roleIds: unknown[] }).roleIds.map(String));
    }
  } catch {
    // ignore
  }
  return new Set();
}

export async function isProtectedRoleMember(guildId: string, roleIds: string[]): Promise<boolean> {
  const protectedIds = await getProtectedRoleIds(guildId);
  if (!protectedIds.size) return false;
  return roleIds.some((id) => protectedIds.has(id));
}

export async function getCollectionData(guildId: string, name: string): Promise<string | null> {
  const row = await prisma.antiCollection.findUnique({
    where: { guildId_name: { guildId, name } },
  });
  return row?.data ?? null;
}
