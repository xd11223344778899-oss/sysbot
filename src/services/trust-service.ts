import { prisma } from '../database/prisma.js';
import { getGuildConfig, invalidateGuildConfig } from '../database/guild-config.js';

const TRUST_TTL_MS = 30_000;
const trustCache = new Map<string, { trusted: Set<string>; expires: number }>();
const strikeCache = new Map<string, { count: number; expires: number }>();

function trustKey(guildId: string): string {
  return guildId;
}

function strikeKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

async function loadTrustedSet(guildId: string): Promise<Set<string>> {
  const key = trustKey(guildId);
  const cached = trustCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.trusted;

  const rows = await prisma.trustEntry.findMany({ where: { guildId } });
  const trusted = new Set(rows.map((r) => r.userId));
  trustCache.set(key, { trusted, expires: Date.now() + TRUST_TTL_MS });
  return trusted;
}

export function invalidateTrustCache(guildId: string): void {
  trustCache.delete(trustKey(guildId));
}

export async function isTrusted(guildId: string, userId: string): Promise<boolean> {
  const set = await loadTrustedSet(guildId);
  return set.has(userId);
}

export async function toggleTrustEntry(guildId: string, userId: string): Promise<boolean> {
  const existing = await prisma.trustEntry.findUnique({
    where: { guildId_userId: { guildId, userId } },
  });
  if (existing) {
    await prisma.trustEntry.delete({ where: { guildId_userId: { guildId, userId } } });
    invalidateTrustCache(guildId);
    return false;
  }
  await prisma.trustEntry.create({ data: { guildId, userId } });
  invalidateTrustCache(guildId);
  return true;
}

export async function listTrustedUsers(guildId: string): Promise<string[]> {
  return [...(await loadTrustedSet(guildId))];
}

export async function recordProtectionStrike(
  guildId: string,
  userId: string,
): Promise<{ count: number; limit: number; exceeded: boolean }> {
  const cfg = await getGuildConfig(guildId);
  const limit = cfg.protectionLimit || 3;
  const key = strikeKey(guildId, userId);
  const cached = strikeCache.get(key);
  const count = (cached?.expires && cached.expires > Date.now() ? cached.count : 0) + 1;
  strikeCache.set(key, { count, expires: Date.now() + 86_400_000 });
  return { count, limit, exceeded: count >= limit };
}

export function clearProtectionStrikes(guildId: string, userId: string): void {
  strikeCache.delete(strikeKey(guildId, userId));
}

export async function updateProtectionToggle(
  guildId: string,
  key: 'antiDelete' | 'antiLinks' | 'antiPerms' | 'antiBots' | 'antiWord',
  value: boolean,
): Promise<void> {
  await prisma.guild.update({ where: { id: guildId }, data: { [key]: value } });
  invalidateGuildConfig(guildId);
}
