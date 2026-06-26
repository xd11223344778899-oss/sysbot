import { createCanvas, loadImage } from '@napi-rs/canvas';
import { AttachmentBuilder, type GuildMember, type VoiceBasedChannel } from 'discord.js';
import {
  getVoiceSnapshotIconSource,
  type VoiceSnapshotIconKey,
} from '../shared/log-assets.js';
import { formatCapacityCount, formatCapacityLimit } from '../shared/voice-log-capacity.js';
import { ensureSnapshotFonts, snapshotFontBold, snapshotFontRegular } from './voice-snapshot-fonts.js';

const BG = '#2b2d31';
const TEXT = '#dbdee1';
const SUBTEXT = '#949ba4';
const MUTED = '#ed4245';
const FALLBACK_AVATAR = '#4e5058';
const BADGE_LEFT_BG = '#1a1b1e';
const BADGE_RIGHT_BG = '#2e3035';
const BADGE_TEXT = '#b5bac1';

const WIDTH = 400;
const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 44;
const HEADER_CENTER_Y = 19;
const AVATAR = 32;
const ICON_SIZE = 18;
const ICON_PAD = 8;
const HEADER_ICON = 18;
const HIGHLIGHT_ALPHA = 0.15;
const BADGE_H = 18;
const BADGE_PAD_X = 8;

export interface VoiceSnapshotOptions {
  /** Highlight a member row (e.g. vmute target). */
  highlightUserId?: string;
}

interface MemberVoiceFlags {
  serverMute: boolean;
  selfMute: boolean;
  serverDeaf: boolean;
  selfDeaf: boolean;
  streaming: boolean;
  selfVideo: boolean;
}

const iconCache = new Map<string, Awaited<ReturnType<typeof loadImage>> | null>();

function labelText(value: string, maxLen: number): string {
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLen) : '?';
}

async function loadSnapshotIcon(
  key: VoiceSnapshotIconKey,
): Promise<Awaited<ReturnType<typeof loadImage>> | null> {
  const source = getVoiceSnapshotIconSource(key);
  if (!source) return null;
  if (iconCache.has(source)) return iconCache.get(source) ?? null;
  try {
    const img = await loadImage(source);
    iconCache.set(source, img);
    return img;
  } catch {
    iconCache.set(source, null);
    return null;
  }
}

function roundRect(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawRowHighlight(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  y: number,
): void {
  ctx.save();
  ctx.globalAlpha = HIGHLIGHT_ALPHA;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, 4, y, WIDTH - 8, ROW_HEIGHT, 4);
  ctx.fill();
  ctx.restore();
}

function drawCapacityBadge(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  memberCount: number,
  userLimit: number,
  badgeRight: number,
  centerY: number,
): void {
  const leftText = formatCapacityCount(memberCount);
  const rightText = formatCapacityLimit(userLimit);

  ctx.font = snapshotFontRegular(11);
  const leftTextW = ctx.measureText(leftText).width;
  const rightTextW = ctx.measureText(rightText).width;
  const leftW = leftTextW + BADGE_PAD_X * 2;
  const rightW = rightTextW + BADGE_PAD_X * 2;
  const totalW = leftW + rightW;
  const x = badgeRight - totalW;
  const y = centerY - BADGE_H / 2;
  const r = BADGE_H / 2;

  ctx.fillStyle = BADGE_RIGHT_BG;
  roundRect(ctx, x, y, totalW, BADGE_H, r);
  ctx.fill();

  ctx.save();
  roundRect(ctx, x, y, leftW, BADGE_H, r);
  ctx.clip();
  ctx.fillStyle = BADGE_LEFT_BG;
  ctx.fillRect(x, y, leftW, BADGE_H);
  ctx.restore();

  ctx.strokeStyle = '#3a3c42';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + leftW, y + 3);
  ctx.lineTo(x + leftW, y + BADGE_H - 3);
  ctx.stroke();

  ctx.fillStyle = BADGE_TEXT;
  ctx.textBaseline = 'middle';
  ctx.fillText(leftText, x + leftW / 2, centerY);
  ctx.fillText(rightText, x + leftW + rightW / 2, centerY);
  ctx.textBaseline = 'alphabetic';
}

async function drawAvatar(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  avatarUrl: string,
  cx: number,
  cy: number,
): Promise<void> {
  const r = AVATAR / 2;
  try {
    const img = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, AVATAR, AVATAR);
    ctx.restore();
  } catch {
    ctx.fillStyle = FALLBACK_AVATAR;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

async function drawIcon(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  key: VoiceSnapshotIconKey,
  rightX: number,
  centerY: number,
): Promise<number> {
  const img = await loadSnapshotIcon(key);
  if (!img) return 0;
  ctx.drawImage(img, rightX - ICON_SIZE, centerY - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE);
  return ICON_SIZE + ICON_PAD;
}

async function drawStatusIcons(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  flags: MemberVoiceFlags,
  rightX: number,
  centerY: number,
): Promise<void> {
  const slots: Array<{ key: VoiceSnapshotIconKey; active: boolean }> = [
    { key: 'video', active: flags.selfVideo },
    { key: 'live', active: flags.streaming },
    { key: 'selfDeaf', active: flags.selfDeaf },
    { key: 'serverDeaf', active: flags.serverDeaf },
    { key: 'selfMute', active: flags.selfMute },
    { key: 'serverMute', active: flags.serverMute },
  ];

  let x = rightX;
  for (const { key, active } of slots) {
    if (!active) continue;
    const used = await drawIcon(ctx, key, x, centerY);
    if (used > 0) {
      x -= used;
      continue;
    }
    if (key === 'serverMute' || key === 'selfMute') {
      ctx.fillStyle = MUTED;
      ctx.font = snapshotFontRegular(13);
      ctx.textBaseline = 'middle';
      ctx.fillText('M', x - 10, centerY);
      ctx.textBaseline = 'alphabetic';
      x -= 14;
    }
  }
}

async function drawChannelHeader(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  channelName: string,
  memberCount: number,
  userLimit: number,
  showBadge = true,
): Promise<void> {
  const iconX = 14;
  const nameX = iconX + HEADER_ICON + 8;
  const channelIcon = await loadSnapshotIcon('voiceChannel');
  const name = labelText(channelName, 30);

  ctx.fillStyle = TEXT;
  ctx.font = snapshotFontBold(15);

  if (channelIcon) {
    ctx.drawImage(channelIcon, iconX, HEADER_CENTER_Y - HEADER_ICON / 2, HEADER_ICON, HEADER_ICON);
    ctx.textBaseline = 'middle';
    ctx.fillText(name, nameX, HEADER_CENTER_Y);
    ctx.textBaseline = 'alphabetic';
  } else {
    ctx.textBaseline = 'middle';
    ctx.fillText(`> ${name}`.slice(0, 36), iconX, HEADER_CENTER_Y);
    ctx.textBaseline = 'alphabetic';
  }

  if (showBadge) {
    drawCapacityBadge(ctx, memberCount, userLimit, WIDTH - 14, HEADER_CENTER_Y);
  }
}

async function drawMemberRow(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  member: GuildMember,
  y: number,
  highlight: boolean,
): Promise<void> {
  if (highlight) {
    drawRowHighlight(ctx, y);
  }

  const centerY = y + ROW_HEIGHT / 2;
  const name = labelText(member.displayName || member.user.username, 28);

  await drawAvatar(ctx, member.user.displayAvatarURL({ extension: 'png', size: 64 }), 30, centerY);

  ctx.fillStyle = TEXT;
  ctx.font = snapshotFontBold(14);
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 54, centerY + 1);
  ctx.textBaseline = 'alphabetic';

  await drawStatusIcons(
    ctx,
    {
      serverMute: Boolean(member.voice.serverMute),
      selfMute: Boolean(member.voice.selfMute),
      serverDeaf: Boolean(member.voice.serverDeaf),
      selfDeaf: Boolean(member.voice.selfDeaf),
      streaming: Boolean(member.voice.streaming),
      selfVideo: Boolean(member.voice.selfVideo),
    },
    WIDTH - 12,
    centerY,
  );
}

export async function renderVoiceChannelSnapshot(
  channel: VoiceBasedChannel,
  options: VoiceSnapshotOptions = {},
): Promise<AttachmentBuilder | null> {
  if (!channel.isVoiceBased()) return null;

  ensureSnapshotFonts();

  const members = [...channel.members.values()].slice(0, 14);
  const height = HEADER_HEIGHT + Math.max(members.length, 1) * ROW_HEIGHT + 12;

  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, height);

  await drawChannelHeader(ctx, channel.name, channel.members.size, channel.userLimit);

  let y = HEADER_HEIGHT;
  if (!members.length) {
    ctx.fillStyle = SUBTEXT;
    ctx.font = snapshotFontRegular(13);
    ctx.textBaseline = 'middle';
    ctx.fillText('No one here yet', 54, y + ROW_HEIGHT / 2);
    ctx.textBaseline = 'alphabetic';
  } else {
    for (const member of members) {
      await drawMemberRow(ctx, member, y, options.highlightUserId === member.id);
      y += ROW_HEIGHT;
    }
  }

  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'voice-channel.png' });
}

export async function renderOfflineVmuteSnapshot(
  target: GuildMember,
): Promise<AttachmentBuilder> {
  ensureSnapshotFonts();

  const height = HEADER_HEIGHT + ROW_HEIGHT + 28;

  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, WIDTH, height);

  await drawChannelHeader(ctx, 'Voice Channels', 0, 0, false);

  let y = HEADER_HEIGHT;
  ctx.fillStyle = SUBTEXT;
  ctx.font = snapshotFontRegular(12);
  ctx.fillText('Not in voice channel', 54, y + 4);
  y += 16;

  drawRowHighlight(ctx, y);

  const centerY = y + ROW_HEIGHT / 2;
  const name = labelText(target.displayName || target.user.username, 28);
  await drawAvatar(
    ctx,
    target.user.displayAvatarURL({ extension: 'png', size: 128 }),
    30,
    centerY,
  );

  ctx.fillStyle = TEXT;
  ctx.font = snapshotFontBold(14);
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 54, centerY + 1);
  ctx.textBaseline = 'alphabetic';

  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'voice-offline.png' });
}
