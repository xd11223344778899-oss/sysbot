import { AuditLogEvent, type Client, type GuildMember, type User, type VoiceState } from 'discord.js';
import {
  classifyVoiceChannelChange,
  type VoiceChannelClassification,
} from './voice-log-classifier.js';
import { matchAuditEntry } from './log-audit.js';
import {
  consumeVoiceCommandLogContext,
  shouldSkipVmuteGuardLog,
  wasCommandVoiceLogSent,
} from './voice-log-context.js';
import { sendVoiceLog } from './voice-log-sender.js';
import {
  buildVoiceLogEmbed,
  type VoiceLogKind,
  type VoiceLogParticipant,
} from '../shared/voice-log-embed.js';

function toParticipant(
  id: string,
  user?: { tag?: string; displayAvatarURL?: () => string },
  displayName?: string,
): VoiceLogParticipant {
  return {
    id,
    tag: user?.tag,
    displayName,
    avatarUrl: user?.displayAvatarURL?.() ?? null,
  };
}

function memberParticipant(member: GuildMember): VoiceLogParticipant {
  return toParticipant(member.id, member.user, member.displayName);
}

function userParticipant(user: User): VoiceLogParticipant {
  return toParticipant(user.id, user, user.displayName);
}

function channelRef(channel: { id: string; name: string }) {
  return { id: channel.id, name: channel.name };
}

function botFooter(client: Client) {
  const user = client.user;
  if (!user) return undefined;
  return { name: user.username, iconUrl: user.displayAvatarURL() };
}

async function resolveServerVoiceModLog(
  guildId: string,
  memberId: string,
  muted: boolean,
): Promise<{
  source: 'command' | 'manual';
  actor: VoiceLogParticipant;
  reason?: string | null;
  actionAt?: Date | null;
}> {
  const cmd = consumeVoiceCommandLogContext(guildId, memberId);
  if (cmd && ((muted && cmd.action === 'mute') || (!muted && cmd.action === 'unmute'))) {
    return {
      source: 'command',
      actor: toParticipant(cmd.moderatorId),
      reason: cmd.reason,
      actionAt: cmd.expiresAt ?? cmd.appliedAt,
    };
  }
  return { source: 'manual', actor: toParticipant(memberId) };
}

async function logChannelEvent(
  client: Client,
  classification: VoiceChannelClassification,
  member: GuildMember,
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  const guildId = newState.guild.id;
  const voiceChannel = newState.channel ?? oldState.channel;
  const target = memberParticipant(member);
  let kind: VoiceLogKind;
  let actor = target;
  let source: 'command' | 'manual' | 'self' = 'self';

  switch (classification.kind) {
    case 'join':
      kind = 'join';
      break;
    case 'leave':
      kind = 'leave';
      break;
    case 'change':
      kind = 'change';
      break;
    case 'move':
      kind = 'move';
      source = 'manual';
      if (classification.executor) {
        actor = userParticipant(classification.executor);
      }
      break;
    case 'disconnect':
      kind = 'disconnect';
      source = 'manual';
      if (classification.executor) {
        actor = userParticipant(classification.executor);
      }
      break;
    default:
      return;
  }

  const embed = buildVoiceLogEmbed({
    kind,
    actor,
    target,
    channel: voiceChannel ? channelRef(voiceChannel) : null,
    source,
    occurredAt: new Date(),
    botFooter: botFooter(client),
  });

  await sendVoiceLog(client, guildId, kind, embed, {
    voiceChannel: voiceChannel ?? null,
    highlightUserId: member.id,
  });
}

async function logServerMuteChange(
  client: Client,
  member: GuildMember,
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  const guildId = newState.guild.id;
  const muted = Boolean(newState.serverMute);

  if (shouldSkipVmuteGuardLog(guildId, member.id)) return;

  const action: 'mute' | 'unmute' = muted ? 'mute' : 'unmute';
  if (wasCommandVoiceLogSent(guildId, member.id, action)) return;

  const audit = await matchAuditEntry(newState.guild, AuditLogEvent.MemberUpdate, member.id);
  const resolved = await resolveServerVoiceModLog(guildId, member.id, muted);

  let actor = resolved.actor;
  if (resolved.source === 'manual' && audit.executor) {
    actor = userParticipant(audit.executor);
  } else if (resolved.source === 'command') {
    const mod = await newState.guild.members.fetch(resolved.actor.id).catch(() => null);
    if (mod) actor = memberParticipant(mod);
  }

  const kind: VoiceLogKind = muted ? 'mute' : 'unmute';
  const voiceChannel = newState.channel ?? oldState.channel;

  const embed = buildVoiceLogEmbed({
    kind,
    actor,
    target: memberParticipant(member),
    channel: voiceChannel ? channelRef(voiceChannel) : null,
    source: resolved.source,
    reason: resolved.source === 'command' ? resolved.reason : audit.reason,
    actionAt: resolved.source === 'command' ? resolved.actionAt : undefined,
    occurredAt: new Date(),
    botFooter: botFooter(client),
  });

  await sendVoiceLog(client, guildId, kind, embed, {
    voiceChannel: voiceChannel ?? null,
    highlightUserId: member.id,
  });
}

async function logServerDeafChange(
  client: Client,
  member: GuildMember,
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  const guildId = newState.guild.id;
  const deafened = Boolean(newState.serverDeaf);
  const audit = await matchAuditEntry(newState.guild, AuditLogEvent.MemberUpdate, member.id);

  const actor = audit.executor
    ? userParticipant(audit.executor)
    : memberParticipant(member);

  const kind: VoiceLogKind = deafened ? 'deafen' : 'undeafen';
  const voiceChannel = newState.channel ?? oldState.channel;

  const embed = buildVoiceLogEmbed({
    kind,
    actor,
    target: memberParticipant(member),
    channel: voiceChannel ? channelRef(voiceChannel) : null,
    source: 'manual',
    reason: audit.reason,
    occurredAt: new Date(),
    botFooter: botFooter(client),
  });

  await sendVoiceLog(client, guildId, kind, embed, {
    voiceChannel: voiceChannel ?? null,
    highlightUserId: member.id,
  });
}

async function logSelfVoiceToggle(
  client: Client,
  member: GuildMember,
  oldState: VoiceState,
  newState: VoiceState,
  field: 'selfMute' | 'selfDeaf',
): Promise<void> {
  const guildId = newState.guild.id;
  const voiceChannel = newState.channel ?? oldState.channel;
  if (!voiceChannel) return;

  const enabled =
    field === 'selfMute' ? Boolean(newState.selfMute) : Boolean(newState.selfDeaf);

  let kind: VoiceLogKind;
  if (field === 'selfMute') {
    kind = enabled ? 'selfMute' : 'selfMute';
  } else {
    kind = enabled ? 'selfDeafen' : 'selfDeafen';
  }

  if (!enabled) return;

  const target = memberParticipant(member);
  const embed = buildVoiceLogEmbed({
    kind,
    actor: target,
    target,
    channel: channelRef(voiceChannel),
    source: 'self',
    occurredAt: new Date(),
    botFooter: botFooter(client),
  });

  await sendVoiceLog(client, guildId, kind, embed, {
    voiceChannel,
    highlightUserId: member.id,
  });
}

export async function handleVoiceLogging(
  client: Client,
  oldState: VoiceState,
  newState: VoiceState,
): Promise<void> {
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;

  const classification = await classifyVoiceChannelChange(oldState, newState);
  if (classification.kind !== 'none') {
    await logChannelEvent(client, classification, member, oldState, newState);
  }

  if (oldState.serverMute !== newState.serverMute) {
    await logServerMuteChange(client, member, oldState, newState);
  }

  if (oldState.serverDeaf !== newState.serverDeaf) {
    await logServerDeafChange(client, member, oldState, newState);
  }

  if (oldState.selfMute !== newState.selfMute && newState.selfMute) {
    await logSelfVoiceToggle(client, member, oldState, newState, 'selfMute');
  }

  if (oldState.selfDeaf !== newState.selfDeaf && newState.selfDeaf) {
    await logSelfVoiceToggle(client, member, oldState, newState, 'selfDeaf');
  }
}
