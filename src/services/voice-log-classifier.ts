import { AuditLogEvent, type User, type VoiceState } from 'discord.js';
import { matchVoiceAudit } from './log-audit.js';

export type VoiceLogKind = 'join' | 'leave' | 'change' | 'move' | 'disconnect' | 'none';

export interface VoiceChannelClassification {
  kind: VoiceLogKind;
  executor?: User;
  reason?: string;
}

/** Classifies a voice channel transition (not mute/deafen-only updates). */
export async function classifyVoiceChannelChange(
  oldState: VoiceState,
  newState: VoiceState,
): Promise<VoiceChannelClassification> {
  const member = newState.member ?? oldState.member;
  if (!member) return { kind: 'none' };

  const oldId = oldState.channelId;
  const newId = newState.channelId;

  if (!oldId && newId) {
    return { kind: 'join' };
  }

  if (oldId && !newId) {
    const audit = await matchVoiceAudit(
      newState.guild,
      AuditLogEvent.MemberDisconnect,
      oldId,
    );
    if (audit.executor && audit.executor.id !== member.id) {
      return { kind: 'disconnect', executor: audit.executor, reason: audit.reason ?? undefined };
    }
    return { kind: 'leave' };
  }

  if (oldId && newId && oldId !== newId) {
    const audit = await matchVoiceAudit(newState.guild, AuditLogEvent.MemberMove, newId);
    if (audit.executor && audit.executor.id !== member.id) {
      return { kind: 'move', executor: audit.executor, reason: audit.reason ?? undefined };
    }
    return { kind: 'change' };
  }

  return { kind: 'none' };
}

/** Maps classification kind to guild log event type key. */
export const VOICE_LOG_EVENT_TYPE: Record<
  Exclude<VoiceLogKind, 'none'>,
  string
> = {
  join: 'voiceJoin',
  leave: 'voiceLeave',
  change: 'voiceChange',
  move: 'voiceMove',
  disconnect: 'voiceDisconnect',
};
