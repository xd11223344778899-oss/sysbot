import type { Client, AttachmentBuilder, EmbedBuilder, VoiceBasedChannel } from 'discord.js';
import type { VoiceLogKind } from '../shared/voice-log-embed.js';
import { getVoiceLogIconAttachment, type VoiceLogIconKey } from '../shared/log-assets.js';
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

const EMBED_THUMB_KEYS: Record<VoiceLogKind, VoiceLogIconKey> = {
  mute: 'mute',
  unmute: 'unmute',
  deafen: 'deafen',
  undeafen: 'undeafen',
  join: 'join',
  leave: 'leave',
  change: 'change',
  move: 'move',
  disconnect: 'disconnect',
  selfMute: 'selfMute',
  selfDeafen: 'selfDeaf',
};

function attachVoiceLogThumbnail(
  kind: VoiceLogKind,
  embed: EmbedBuilder,
  files: AttachmentBuilder[],
): void {
  if (embed.data.thumbnail?.url) return;

  const attachment = getVoiceLogIconAttachment(EMBED_THUMB_KEYS[kind]);
  if (!attachment) return;

  embed.setThumbnail(`attachment://${attachment.name}`);
  files.push(attachment);
}

export interface SendVoiceLogOptions {
  voiceChannel?: VoiceBasedChannel | null;
  snapshot?: AttachmentBuilder | null;
}

export async function sendVoiceLog(
  client: Client,
  guildId: string,
  kind: VoiceLogKind,
  embed: EmbedBuilder,
  voiceChannelOrOptions?: VoiceBasedChannel | null | SendVoiceLogOptions,
): Promise<void> {
  const eventType = VOICE_KIND_TO_EVENT[kind];
  const files: AttachmentBuilder[] = [];

  const options: SendVoiceLogOptions =
    voiceChannelOrOptions && 'isVoiceBased' in voiceChannelOrOptions
      ? { voiceChannel: voiceChannelOrOptions }
      : (voiceChannelOrOptions ?? {});

  let snapshot = options.snapshot ?? null;
  if (!snapshot && options.voiceChannel?.isVoiceBased()) {
    snapshot = await renderVoiceChannelSnapshot(options.voiceChannel);
  }

  if (snapshot) {
    embed.setImage(`attachment://${snapshot.name}`);
    files.push(snapshot);
  }

  attachVoiceLogThumbnail(kind, embed, files);

  await sendLog(client, guildId, eventType, embed, files);
}
