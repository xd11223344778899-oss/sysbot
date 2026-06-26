import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AttachmentBuilder } from 'discord.js';

/**
 * Static assets for log embeds (thumbnails, icons).
 *
 * Source files live in project `icon/` (see filenames below).
 * Embed thumbnails: env HTTPS URL (VOICE_LOG_ICON_*) takes priority; otherwise the
 * bot attaches the local PNG and uses attachment:// in the log message.
 */
export const PROTECTION_ALERT_THUMBNAIL_URL =
  process.env.PROTECTION_LOG_THUMBNAIL_URL?.trim() || '';

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ICON_DIR = path.join(PROJECT_ROOT, 'icon');

function localIconPath(filename: string): string {
  const full = path.join(ICON_DIR, filename);
  return fs.existsSync(full) ? full : '';
}

function iconEnv(key: string): string {
  return process.env[`VOICE_LOG_ICON_${key.toUpperCase()}`]?.trim() || '';
}

function snapshotIconEnv(key: string): string {
  return process.env[`VOICE_SNAPSHOT_ICON_${key.toUpperCase()}`]?.trim() || '';
}

function resolveIconUrl(envKey: string, filename: string): string {
  const fromEnv = iconEnv(envKey);
  if (fromEnv) return fromEnv;
  return localIconPath(filename);
}

function resolveSnapshotPath(envKey: string, filename: string): string {
  const fromEnv = snapshotIconEnv(envKey);
  if (fromEnv) return fromEnv;
  return localIconPath(filename);
}

/** Embed thumbnail filenames in `icon/` */
const EMBED_ICON_FILES = {
  mute: 'mute.png',
  unmute: 'unmute.png',
  deafen: 'deafen.png',
  undeafen: 'undeafen.png',
  join: 'join.png',
  leave: 'leave.png',
  change: 'change.png',
  move: 'move.png',
  disconnect: 'disconnect.png',
  selfMute: 'selfmute-small.png',
  selfDeaf: 'selfdeaf-small.png',
} as const;

/** Snapshot icon filenames in `icon/` */
const SNAPSHOT_ICON_FILES = {
  serverMute: 'mute-small.png',
  selfMute: 'selfmute-small.png',
  serverDeaf: 'deaf-small.png',
  selfDeaf: 'selfdeaf-small.png',
  live: 'live-small.png',
  video: 'video-small.png',
  voiceChannel: 'voice-channel.png',
} as const;

export const VOICE_LOG_ICONS = {
  mute: resolveIconUrl('mute', EMBED_ICON_FILES.mute),
  unmute: resolveIconUrl('unmute', EMBED_ICON_FILES.unmute),
  deafen: resolveIconUrl('deafen', EMBED_ICON_FILES.deafen),
  undeafen: resolveIconUrl('undeafen', EMBED_ICON_FILES.undeafen),
  join: resolveIconUrl('join', EMBED_ICON_FILES.join),
  leave: resolveIconUrl('leave', EMBED_ICON_FILES.leave),
  change: resolveIconUrl('change', EMBED_ICON_FILES.change),
  move: resolveIconUrl('move', EMBED_ICON_FILES.move),
  disconnect: resolveIconUrl('disconnect', EMBED_ICON_FILES.disconnect),
  selfMute: resolveIconUrl('self_mute', EMBED_ICON_FILES.selfMute),
  selfDeaf: resolveIconUrl('self_deaf', EMBED_ICON_FILES.selfDeaf),
} as const;

export type VoiceLogIconKey = keyof typeof VOICE_LOG_ICONS;

export const VOICE_SNAPSHOT_ICONS = {
  serverMute: resolveSnapshotPath('server_mute', SNAPSHOT_ICON_FILES.serverMute),
  selfMute: resolveSnapshotPath('self_mute', SNAPSHOT_ICON_FILES.selfMute),
  serverDeaf: resolveSnapshotPath('server_deaf', SNAPSHOT_ICON_FILES.serverDeaf),
  selfDeaf: resolveSnapshotPath('self_deaf', SNAPSHOT_ICON_FILES.selfDeaf),
  live: resolveSnapshotPath('live', SNAPSHOT_ICON_FILES.live),
  video: resolveSnapshotPath('video', SNAPSHOT_ICON_FILES.video),
  voiceChannel: resolveSnapshotPath('voice_channel', SNAPSHOT_ICON_FILES.voiceChannel),
} as const;

export type VoiceSnapshotIconKey = keyof typeof VOICE_SNAPSHOT_ICONS;

function isHttpsUrl(value: string): boolean {
  return value.startsWith('https://') || value.startsWith('http://');
}

/** HTTPS thumbnail URL for embeds, if configured via env. */
export function getVoiceLogIconUrl(key: VoiceLogIconKey): string {
  const value = VOICE_LOG_ICONS[key];
  return isHttpsUrl(value) ? value : '';
}

const EMBED_ICON_ENV_KEYS: Record<VoiceLogIconKey, string> = {
  mute: 'mute',
  unmute: 'unmute',
  deafen: 'deafen',
  undeafen: 'undeafen',
  join: 'join',
  leave: 'leave',
  change: 'change',
  move: 'move',
  disconnect: 'disconnect',
  selfMute: 'self_mute',
  selfDeaf: 'self_deaf',
};

/** Local file path for attachment:// embed thumbnails. */
export function getVoiceLogIconAttachment(key: VoiceLogIconKey): AttachmentBuilder | null {
  const envUrl = iconEnv(EMBED_ICON_ENV_KEYS[key]);
  if (envUrl && isHttpsUrl(envUrl)) return null;

  const filePath = localIconPath(EMBED_ICON_FILES[key]);
  if (!filePath) return null;

  const name = `voice-log-${key}${path.extname(filePath)}`;
  return new AttachmentBuilder(filePath, { name });
}

/** Path or URL for canvas loadImage(). */
export function getVoiceSnapshotIconSource(key: VoiceSnapshotIconKey): string {
  return VOICE_SNAPSHOT_ICONS[key];
}
