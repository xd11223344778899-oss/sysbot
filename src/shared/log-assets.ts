/**
 * Static assets for log embeds (thumbnails, icons).
 *
 * Protection alert thumbnail (top-right of the embed):
 * Set PROTECTION_LOG_THUMBNAIL_URL or paste URL below.
 */
export const PROTECTION_ALERT_THUMBNAIL_URL =
  process.env.PROTECTION_LOG_THUMBNAIL_URL?.trim() || '';

/**
 * Voice log thumbnails (top-right of embed).
 * Place PNG files in assets/logs/voice/ and set URLs here, or use env vars.
 *
 * Required files (256x256 transparent PNG recommended):
 * - mute.png, unmute.png, deafen.png, undeafen.png
 * - join.png, leave.png, change.png, move.png, disconnect.png, self.png
 */
function iconEnv(key: string): string {
  return process.env[`VOICE_LOG_ICON_${key.toUpperCase()}`]?.trim() || '';
}

export const VOICE_LOG_ICONS = {
  mute: iconEnv('mute'),
  unmute: iconEnv('unmute'),
  deafen: iconEnv('deafen'),
  undeafen: iconEnv('undeafen'),
  join: iconEnv('join'),
  leave: iconEnv('leave'),
  change: iconEnv('change'),
  move: iconEnv('move'),
  disconnect: iconEnv('disconnect'),
  self: iconEnv('self'),
} as const;

export type VoiceLogIconKey = keyof typeof VOICE_LOG_ICONS;
