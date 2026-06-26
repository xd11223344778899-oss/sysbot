export type VoiceLogCommandAction = 'mute' | 'unmute';

export interface PendingVoiceLogContext {
  guildId: string;
  userId: string;
  moderatorId: string;
  reason?: string | null;
  expiresAt?: Date | null;
  appliedAt: Date;
  action: VoiceLogCommandAction;
  expires: number;
}

const pending = new Map<string, PendingVoiceLogContext>();
const TTL_MS = 5000;

function key(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function stashVoiceCommandLogContext(
  ctx: Omit<PendingVoiceLogContext, 'expires' | 'appliedAt'> & { appliedAt?: Date },
): void {
  const record: PendingVoiceLogContext = {
    ...ctx,
    appliedAt: ctx.appliedAt ?? new Date(),
    expires: Date.now() + TTL_MS,
  };
  pending.set(key(ctx.guildId, ctx.userId), record);
}

export function consumeVoiceCommandLogContext(
  guildId: string,
  userId: string,
): PendingVoiceLogContext | null {
  const k = key(guildId, userId);
  const record = pending.get(k);
  if (!record || record.expires < Date.now()) {
    pending.delete(k);
    return null;
  }
  pending.delete(k);
  return record;
}

/** Skip logging when vmute-guard re-applies server mute automatically. */
const guardSkip = new Map<string, number>();
const GUARD_SKIP_MS = 3000;

export function markVmuteGuardSkip(guildId: string, userId: string): void {
  guardSkip.set(key(guildId, userId), Date.now() + GUARD_SKIP_MS);
}

export function shouldSkipVmuteGuardLog(guildId: string, userId: string): boolean {
  const until = guardSkip.get(key(guildId, userId));
  if (!until) return false;
  if (until < Date.now()) {
    guardSkip.delete(key(guildId, userId));
    return false;
  }
  return true;
}
