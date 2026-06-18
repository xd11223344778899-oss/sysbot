import type { Guild, GuildMember, Role, GuildBasedChannel } from 'discord.js';

const ID_RE = /^(?:<@!?|<#|<@&)?(\d{16,20})>?$/;

function extractId(token: string | undefined): string | null {
  if (!token) return null;
  const match = token.match(ID_RE);
  return match ? match[1] : null;
}

/** Resolve a member from a mention, raw id, or (loosely) a name token. */
export async function resolveMember(
  guild: Guild,
  token: string | undefined,
  options?: { punitive?: boolean },
): Promise<GuildMember | null> {
  const id = extractId(token);
  if (id) {
    return guild.members.fetch(id).catch(() => null);
  }
  if (!token) return null;
  if (options?.punitive) return null;
  const lower = token.toLowerCase();
  const matches = guild.members.cache.filter(
    (m) => m.user.username.toLowerCase() === lower || m.displayName.toLowerCase() === lower,
  );
  if (matches.size === 1) return matches.first() ?? null;
  return null;
}

export function resolveRole(guild: Guild, token: string | undefined): Role | null {
  const id = extractId(token);
  if (id) return guild.roles.cache.get(id) ?? null;
  if (!token) return null;
  const lower = token.toLowerCase();
  return guild.roles.cache.find((r) => r.name.toLowerCase() === lower) ?? null;
}

export function resolveChannel(
  guild: Guild,
  token: string | undefined,
): GuildBasedChannel | null {
  const id = extractId(token);
  if (id) return guild.channels.cache.get(id) ?? null;
  if (!token) return null;
  const lower = token.toLowerCase().replace(/^#/, '');
  return guild.channels.cache.find((c) => c.name.toLowerCase() === lower) ?? null;
}

/** Parse a duration like "10m", "2h", "7d" into milliseconds. */
export function parseDuration(token: string | undefined): number | null {
  if (!token) return null;
  const match = token.match(/^(\d+)\s*(s|m|h|d|w)?$/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = (match[2] ?? 'm').toLowerCase();
  const units: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  return value * units[unit];
}
