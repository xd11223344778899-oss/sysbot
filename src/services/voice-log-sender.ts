import type { Client, EmbedBuilder, VoiceBasedChannel } from 'discord.js';
import type { VoiceLogKind } from '../shared/voice-log-embed.js';
import { sendLog } from './log-service.js';
import { renderVoiceChannelSnapshot } from './voice-channel-snapshot.js';

export const VOICE_KIND_TO_EVENT: Record<VoiceLogKind, string> = {
  join: 'voiceJoin',
  leave: 'voiceLeave',
  change: 'voiceChange',
  move: 'voiceMove',
  disconnect: 'voiceDisconnect',
  mute: 'voiceMute',
  unmute: 'voiceUnmute',
  deafen: 'voiceDeafen',
  undeafen: 'voiceUndeafen',
  selfMute: 'voiceSelfMute',
  selfDeafen: 'voiceSelfDeafen',
};

export async function sendVoiceLog(
  client: Client,
  guildId: string,
  kind: VoiceLogKind,
  embed: EmbedBuilder,
  voiceChannel?: VoiceBasedChannel | null,
): Promise<void> {
  const eventType = VOICE_KIND_TO_EVENT[kind];
  const files = [];

  if (voiceChannel?.isVoiceBased()) {
    const snapshot = await renderVoiceChannelSnapshot(voiceChannel);
    if (snapshot) {
      embed.setImage(`attachment://${snapshot.name}`);
      files.push(snapshot);
    }
  }

  await sendLog(client, guildId, eventType, embed, files);
}
