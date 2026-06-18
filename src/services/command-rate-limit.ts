import { config, isDeveloper } from '../config.js';

const buckets = new Map<string, number[]>();
let totalHits = 0;

function key(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function isRateLimitExempt(userId: string): boolean {
  if (isDeveloper(userId)) return true;
  return config.globalOwners.includes(userId);
}

export function checkCommandRateLimit(
  guildId: string,
  userId: string,
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  if (isRateLimitExempt(userId)) return { allowed: true };

  const k = key(guildId, userId);
  const now = Date.now();
  const windowMs = config.cmdRateLimitWindowMs;
  const max = config.cmdRateLimitMax;
  const times = (buckets.get(k) ?? []).filter((t) => now - t < windowMs);

  if (times.length >= max) {
    totalHits += 1;
    const oldest = times[0] ?? now;
    return { allowed: false, retryAfterMs: Math.max(windowMs - (now - oldest), 500) };
  }

  times.push(now);
  buckets.set(k, times);
  return { allowed: true };
}

export function getRateLimitHitCount(): number {
  return totalHits;
}
