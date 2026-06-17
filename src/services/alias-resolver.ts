import { registry } from '../core/command-registry.js';
import type { Command } from '../types/command.js';
import { prisma } from '../database/prisma.js';
import { getDefaultArabicAlias } from '../shared/default-command-aliases.ar.js';

/** alias (lowercase) -> commandName */
type AliasMap = Map<string, string>;

const cache = new Map<string, AliasMap>();

function normalize(token: string): string {
  return token.toLowerCase().trim();
}

/** Returns true if the token is a registered English command name or built-in alias. */
export function isBuiltinCommandName(token: string): boolean {
  return registry.get(token) !== undefined;
}

async function buildAliasMap(guildId: string): Promise<AliasMap> {
  const map: AliasMap = new Map();
  const custom = await prisma.commandAlias.findMany({ where: { guildId } });

  const primaryOverrides = new Set(
    custom.filter((r) => r.isPrimary).map((r) => r.commandName.toLowerCase()),
  );

  for (const cmd of registry.list()) {
    const key = cmd.name.toLowerCase();
    if (primaryOverrides.has(key)) continue;
    const def = getDefaultArabicAlias(key);
    if (def && !map.has(normalize(def))) {
      map.set(normalize(def), key);
    }
  }

  for (const row of custom) {
    map.set(normalize(row.alias), row.commandName.toLowerCase());
  }

  return map;
}

export async function getGuildAliasMap(guildId: string): Promise<AliasMap> {
  const cached = cache.get(guildId);
  if (cached) return cached;
  const map = await buildAliasMap(guildId);
  cache.set(guildId, map);
  return map;
}

export function invalidateAliasCache(guildId: string): void {
  cache.delete(guildId);
}

/** Resolve a token to the underlying command via guild-specific aliases. */
export async function resolveAliasCommand(guildId: string, token: string): Promise<Command | undefined> {
  const map = await getGuildAliasMap(guildId);
  const commandName = map.get(normalize(token));
  if (!commandName) return undefined;
  return registry.get(commandName);
}

/** Validate a new alias before persisting. */
export async function validateNewAlias(
  guildId: string,
  commandName: string,
  alias: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const norm = normalize(alias);
  if (!norm) return { ok: false, reason: 'الاسم البديل فارغ.' };
  if (!registry.get(commandName)) return { ok: false, reason: 'الأمر الأساسي غير معروف.' };

  const builtin = registry.get(norm);
  if (builtin && builtin.name !== commandName.toLowerCase()) {
    return { ok: false, reason: 'هذا الاسم يطابق أمراً أساسياً آخر.' };
  }

  const map = await getGuildAliasMap(guildId);
  const existing = map.get(norm);
  if (existing && existing !== commandName.toLowerCase()) {
    return { ok: false, reason: 'هذا الاسم مستخدم لأمر آخر.' };
  }

  return { ok: true };
}

export async function listAliasesForCommand(
  guildId: string,
  commandName: string,
): Promise<{ primary: string | null; extras: string[]; defaultPrimary: string | null }> {
  const key = commandName.toLowerCase();
  const custom = await prisma.commandAlias.findMany({ where: { guildId, commandName: key } });
  const primaryRow = custom.find((r) => r.isPrimary);
  const extras = custom.filter((r) => !r.isPrimary).map((r) => r.alias);
  const defaultPrimary = primaryRow ? null : (getDefaultArabicAlias(key) ?? null);

  return {
    primary: primaryRow?.alias ?? defaultPrimary,
    extras,
    defaultPrimary,
  };
}
