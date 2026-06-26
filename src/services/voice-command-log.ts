import type { Client, GuildMember } from 'discord.js';
import { buildVoiceLogEmbed } from '../shared/voice-log-embed.js';
import {
  markCommandVoiceLogSent,
  type VoiceLogCommandAction,
} from './voice-log-context.js';
import { renderOfflineVmuteSnapshot, renderVoiceChannelSnapshot } from './voice-channel-snapshot.js';
import { sendVoiceLog } from './voice-log-sender.js';

export interface VmuteCommandLogInput {
  moderator: GuildMember;
  target: GuildMember;
  kind: VoiceLogCommandAction;
  reason?: string | null;
  actionAt?: Date | null;
}

function botFooter(client: Client) {
  const user = client.user;
  if (!user) return undefined;
  return { name: user.username, iconUrl: user.displayAvatarURL() };
}

export async function sendVmuteCommandLog(
  client: Client,
  input: VmuteCommandLogInput,
): Promise<void> {
  const { moderator, target, kind, reason, actionAt } = input;
  const guildId = target.guild.id;
  const voiceChannel = target.voice.channel;
  const inVoice = Boolean(voiceChannel?.isVoiceBased());

  const embed = buildVoiceLogEmbed({
    kind: kind === 'mute' ? 'mute' : 'unmute',
    actor: {
      id: moderator.id,
      tag: moderator.user.tag,
      displayName: moderator.displayName,
      avatarUrl: moderator.user.displayAvatarURL(),
    },
    target: {
      id: target.id,
      tag: target.user.tag,
      displayName: target.displayName,
      avatarUrl: target.user.displayAvatarURL(),
    },
    channel: inVoice && voiceChannel ? { id: voiceChannel.id, name: voiceChannel.name } : null,
    source: 'command',
    reason,
    actionAt: actionAt ?? new Date(),
    occurredAt: new Date(),
    botFooter: botFooter(client),
  });

  let snapshot = null;
  if (inVoice && voiceChannel?.isVoiceBased()) {
    snapshot = await renderVoiceChannelSnapshot(voiceChannel, { highlightUserId: target.id });
  } else {
    snapshot = await renderOfflineVmuteSnapshot(target);
  }

  await sendVoiceLog(client, guildId, kind === 'mute' ? 'mute' : 'unmute', embed, {
    voiceChannel: inVoice ? voiceChannel : null,
    snapshot,
  });

  markCommandVoiceLogSent(guildId, target.id, kind);
}
