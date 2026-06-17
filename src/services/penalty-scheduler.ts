import type { Client } from 'discord.js';
import type { PenaltyType } from '../shared/enums.js';
import { prisma } from '../database/prisma.js';
import { liftPenalty } from './penalty-service.js';
import { logger } from '../logger.js';

// setTimeout caps at ~24.8 days; we cap scheduling and re-check on startup.
const MAX_DELAY = 2_000_000_000;
const timers = new Map<string, NodeJS.Timeout>();

async function expire(client: Client, penaltyId: string): Promise<void> {
  timers.delete(penaltyId);
  const penalty = await prisma.penalty.findUnique({ where: { id: penaltyId } });
  if (!penalty || !penalty.active) return;

  const guild = await client.guilds.fetch(penalty.guildId).catch(() => null);
  if (!guild) return;
  const member = await guild.members.fetch(penalty.userId).catch(() => null);
  if (!member) {
    await prisma.penalty.update({ where: { id: penaltyId }, data: { active: false } });
    return;
  }
  await liftPenalty(penalty.guildId, member, penalty.type as PenaltyType, client.user!.id);
  logger.info({ guildId: penalty.guildId, userId: penalty.userId }, 'Temporary penalty auto-expired');
}

/** Schedules a single penalty's automatic expiry in-process. */
export function schedulePenaltyExpiry(client: Client, penaltyId: string, expiresAt: Date): void {
  const delay = Math.min(Math.max(expiresAt.getTime() - Date.now(), 0), MAX_DELAY);
  const existing = timers.get(penaltyId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => void expire(client, penaltyId), delay);
  timers.set(penaltyId, timer);
}

/**
 * On startup: lift penalties that already expired while offline, and schedule
 * timers for the ones still pending. Keeps temporary punishments accurate
 * across restarts without any external scheduler.
 */
export async function recoverPenalties(client: Client): Promise<void> {
  const pending = await prisma.penalty.findMany({
    where: { active: true, expiresAt: { not: null } },
  });
  const now = Date.now();
  for (const penalty of pending) {
    if (!penalty.expiresAt) continue;
    if (penalty.expiresAt.getTime() <= now) {
      await expire(client, penalty.id);
    } else {
      schedulePenaltyExpiry(client, penalty.id, penalty.expiresAt);
    }
  }
  logger.info({ count: pending.length }, 'Penalty recovery complete');
}
