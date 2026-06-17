import type { Guild as GuildRow } from '@prisma/client';
import { prisma } from './prisma.js';
import { config } from '../config.js';
import type { LogMode, AntijoinAction } from '../shared/enums.js';

/**
 * Parsed guild configuration. The JSON-encoded list columns are exposed as
 * real arrays and the string "enum" columns as their literal unions, so the
 * rest of the codebase works with strong types instead of raw SQLite strings.
 */
export interface GuildConfig
  extends Omit<GuildRow, 'autoRoleIds' | 'reasons' | 'bannedWords' | 'logMode' | 'antijoinAction'> {
  autoRoleIds: string[];
  reasons: string[];
  bannedWords: string[];
  logMode: LogMode;
  antijoinAction: AntijoinAction;
}

/** Fields the rest of the app may update, with arrays accepted natively. */
export type GuildConfigUpdate = Partial<{
  [K in keyof GuildConfig]: GuildConfig[K];
}>;

const LIST_FIELDS = ['autoRoleIds', 'reasons', 'bannedWords'] as const;

const cache = new Map<string, GuildConfig>();

function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function toConfig(row: GuildRow): GuildConfig {
  return {
    ...row,
    autoRoleIds: parseList(row.autoRoleIds),
    reasons: parseList(row.reasons),
    bannedWords: parseList(row.bannedWords),
    logMode: row.logMode as LogMode,
    antijoinAction: row.antijoinAction as AntijoinAction,
  };
}

/**
 * Returns the configuration for a guild, creating it on first access.
 * Cached in-memory so the hot path (every message) avoids a DB round-trip.
 */
export async function getGuildConfig(guildId: string): Promise<GuildConfig> {
  const cached = cache.get(guildId);
  if (cached) return cached;

  const row = await prisma.guild.upsert({
    where: { id: guildId },
    update: {},
    create: { id: guildId, prefix: config.defaultPrefix },
  });
  const parsed = toConfig(row);
  cache.set(guildId, parsed);
  return parsed;
}

export async function updateGuildConfig(
  guildId: string,
  data: GuildConfigUpdate,
): Promise<GuildConfig> {
  const payload: Record<string, unknown> = { ...data };
  for (const field of LIST_FIELDS) {
    if (Array.isArray(payload[field])) {
      payload[field] = JSON.stringify(payload[field]);
    }
  }
  const row = await prisma.guild.update({ where: { id: guildId }, data: payload });
  const parsed = toConfig(row);
  cache.set(guildId, parsed);
  return parsed;
}

export function invalidateGuildConfig(guildId: string): void {
  cache.delete(guildId);
}
