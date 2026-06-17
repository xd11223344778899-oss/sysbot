import type { Client } from 'discord.js';
import { logger } from '../logger.js';

export type RoleScope = 'all' | 'members' | 'bots';

export interface RoleMultiJob {
  guildId: string;
  roleId: string;
  scope: RoleScope;
  remove: boolean;
}

// Tracks in-flight bulk jobs per guild so we don't run duplicates at once.
const running = new Set<string>();

export function isRoleBulkRunning(guildId: string): boolean {
  return running.has(guildId);
}

/**
 * Applies (or removes) a role across the membership, in-process, with a gentle
 * throttle to stay clear of Discord rate limits. No external queue required.
 */
export async function runRoleMulti(client: Client, job: RoleMultiJob): Promise<number> {
  const { guildId, roleId, scope, remove } = job;
  if (running.has(guildId)) return 0;
  running.add(guildId);
  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return 0;
    const role = await guild.roles.fetch(roleId).catch(() => null);
    if (!role) return 0;

    const members = await guild.members.fetch();
    const targets = members.filter((m) => {
      if (scope === 'members') return !m.user.bot;
      if (scope === 'bots') return m.user.bot;
      return true;
    });

    let done = 0;
    for (const member of targets.values()) {
      try {
        if (remove) await member.roles.remove(role);
        else await member.roles.add(role);
        done += 1;
      } catch {
        // ignore individual failures (hierarchy, gone, etc.)
      }
      if (done % 10 === 0) await new Promise((r) => setTimeout(r, 1500));
    }
    logger.info({ guildId, roleId, done, remove }, 'role-multi finished');
    return done;
  } finally {
    running.delete(guildId);
  }
}
