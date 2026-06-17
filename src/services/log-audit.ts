import { AuditLogEvent, type Guild, type User } from 'discord.js';

const AUDIT_WINDOW_MS = 8000;
const VOICE_AUDIT_WINDOW_MS = 3000;

export interface AuditMatch {
  executor: User | null;
  reason: string | null;
}

/** Finds a recent audit-log entry for correlating **by** / **reason** in logs. */
export async function matchAuditEntry(
  guild: Guild,
  type: AuditLogEvent,
  targetId?: string,
): Promise<AuditMatch> {
  const logs = await guild.fetchAuditLogs({ type, limit: 8 }).catch(() => null);
  if (!logs) return { executor: null, reason: null };

  const now = Date.now();
  const candidates = [...logs.entries.values()].filter(
    (e) => now - e.createdTimestamp < AUDIT_WINDOW_MS,
  );
  const entry = targetId
    ? candidates.find((e) => e.targetId === targetId) ?? candidates[0]
    : candidates[0];

  if (!entry?.executor || entry.executor.partial) return { executor: null, reason: null };
  return {
    executor: entry.executor as User,
    reason: entry.reason?.trim() || null,
  };
}

/**
 * Voice move/disconnect audit entries have no targetId.
 * Match by recency, optional destination channel, and executor != affected member.
 */
export async function matchVoiceAudit(
  guild: Guild,
  type: AuditLogEvent.MemberMove | AuditLogEvent.MemberDisconnect,
  channelId?: string,
): Promise<AuditMatch> {
  const logs = await guild.fetchAuditLogs({ type, limit: 8 }).catch(() => null);
  if (!logs) return { executor: null, reason: null };

  const now = Date.now();
  const candidates = [...logs.entries.values()].filter((e) => {
    if (now - e.createdTimestamp > VOICE_AUDIT_WINDOW_MS) return false;
    if (!channelId) return true;
    const extra = e.extra as { channel?: { id: string } } | null;
    return !extra?.channel?.id || extra.channel.id === channelId;
  });

  const entry = candidates[0];
  if (!entry?.executor || entry.executor.partial) return { executor: null, reason: null };
  return {
    executor: entry.executor as User,
    reason: entry.reason?.trim() || null,
  };
}

export function formatExecutor(user: { id: string } | null | undefined): string | undefined {
  if (!user) return undefined;
  return `<@${user.id}>`;
}
