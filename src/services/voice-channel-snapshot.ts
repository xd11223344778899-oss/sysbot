import { createCanvas, loadImage } from '@napi-rs/canvas';
import { AttachmentBuilder, type GuildMember, type VoiceBasedChannel } from 'discord.js';
import {
  getVoiceSnapshotIconSource,
  type VoiceSnapshotIconKey,
} from '../shared/log-assets.js';
import { formatChannelCapacity } from '../shared/voice-log-capacity.js';

/** Discord-like dark sidebar palette */
const C = {
  outer: '#1e1f22',
  panel: '#2b2d31',
  header: '#232428',
  row: '#2b2d31',
  rowHighlight: '#3f4147',
  divider: '#1e1f22',
  text: '#f2f3f5',
  muted: '#949ba4',
  fallbackAvatar: '#4e5058',
  muteFallback: '#ed4245',
} as const;

const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
const WIDTH = 440;
const PANEL_PAD = 8;
const CHANNEL_ROW_H = 36;
const MEMBER_ROW_H = 42;
const AVATAR = 32;
const ICON_SIZE = 16;
const ICON_PAD = 6;
const HEADER_ICON = 18;

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

async function drawAvatar(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  avatarUrl: string,
  cx: number,
  cy: number,
  size = AVATAR,
): Promise<void> {
  const r = size / 2;
  try {
    const img = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, size, size);
    ctx.restore();
  } catch {
    ctx.fillStyle = C.fallbackAvatar;
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
      ctx.fillStyle = C.muteFallback;
      ctx.font = `13px ${FONT}`;
      ctx.fillText('🔇', x - 14, centerY + 5);
      x -= 18;
    }
  }
}

async function drawChannelRow(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  channelName: string,
  memberCount: number,
  userLimit: number,
  y: number,
  innerW: number,
): Promise<void> {
  const iconX = 14;
  const channelIcon = await loadSnapshotIcon('voiceChannel');
  if (channelIcon) {
    ctx.drawImage(channelIcon, iconX, y + 9, HEADER_ICON, HEADER_ICON);
  }

  ctx.fillStyle = C.text;
  ctx.font = `600 15px ${FONT}`;
  ctx.fillText(channelName.slice(0, 28), iconX + HEADER_ICON + 8, y + 24);

  const capacity = formatChannelCapacity(memberCount, userLimit);
  ctx.fillStyle = C.muted;
  ctx.font = `12px ${FONT}`;
  const capW = ctx.measureText(capacity).width;
  ctx.fillText(capacity, innerW - capW - 12, y + 24);
}

async function drawMemberRow(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  member: GuildMember,
  y: number,
  innerW: number,
  highlight: boolean,
): Promise<void> {
  if (highlight) {
    ctx.fillStyle = C.rowHighlight;
    roundRect(ctx, 6, y + 2, innerW - 12, MEMBER_ROW_H - 4, 4);
    ctx.fill();
  }

  const avatarCx = 30;
  const avatarCy = y + MEMBER_ROW_H / 2;
  await drawAvatar(ctx, member.user.displayAvatarURL({ extension: 'png', size: 64 }), avatarCx, avatarCy);

  ctx.fillStyle = highlight ? C.text : C.text;
  ctx.font = `500 14px ${FONT}`;
  ctx.fillText(member.displayName.slice(0, 26), 52, y + MEMBER_ROW_H / 2 + 5);

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
    innerW - 10,
    y + MEMBER_ROW_H / 2,
  );
}

function drawPanelFrame(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  width: number,
  height: number,
): number {
  ctx.fillStyle = C.outer;
  ctx.fillRect(0, 0, width, height);

  const innerX = PANEL_PAD;
  const innerY = PANEL_PAD;
  const innerW = width - PANEL_PAD * 2;
  const innerH = height - PANEL_PAD * 2;

  ctx.fillStyle = C.panel;
  roundRect(ctx, innerX, innerY, innerW, innerH, 8);
  ctx.fill();

  ctx.strokeStyle = C.divider;
  ctx.lineWidth = 1;
  roundRect(ctx, innerX, innerY, innerW, innerH, 8);
  ctx.stroke();

  return innerW;
}

export async function renderVoiceChannelSnapshot(
  channel: VoiceBasedChannel,
  options: VoiceSnapshotOptions = {},
): Promise<AttachmentBuilder | null> {
  if (!channel.isVoiceBased()) return null;

  const members = [...channel.members.values()].slice(0, 16);
  const innerW = WIDTH - PANEL_PAD * 2;
  const headerH = CHANNEL_ROW_H + 8;
  const dividerH = 1;
  const membersH = Math.max(members.length, 1) * MEMBER_ROW_H;
  const height = PANEL_PAD * 2 + headerH + dividerH + membersH + 8;

  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext('2d');
  const panelW = drawPanelFrame(ctx, WIDTH, height);

  let y = PANEL_PAD + 4;
  await drawChannelRow(ctx, channel.name, channel.members.size, channel.userLimit, y, panelW);
  y += CHANNEL_ROW_H;

  ctx.fillStyle = C.divider;
  ctx.fillRect(PANEL_PAD + 8, y, panelW - 16, 1);
  y += dividerH + 4;

  if (!members.length) {
    ctx.fillStyle = C.muted;
    ctx.font = `13px ${FONT}`;
    ctx.fillText('No one here yet', 52, y + 24);
  } else {
    for (const member of members) {
      await drawMemberRow(
        ctx,
        member,
        y,
        panelW,
        options.highlightUserId === member.id,
      );
      y += MEMBER_ROW_H;
    }
  }

  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'voice-channel.png' });
}

export async function renderOfflineVmuteSnapshot(
  target: GuildMember,
): Promise<AttachmentBuilder> {
  const innerW = WIDTH - PANEL_PAD * 2;
  const height = PANEL_PAD * 2 + CHANNEL_ROW_H + 8 + 1 + MEMBER_ROW_H + 40;

  const canvas = createCanvas(WIDTH, height);
  const ctx = canvas.getContext('2d');
  const panelW = drawPanelFrame(ctx, WIDTH, height);

  let y = PANEL_PAD + 4;
  await drawChannelRow(ctx, 'Voice Channels', 0, 0, y, panelW);
  y += CHANNEL_ROW_H;

  ctx.fillStyle = C.divider;
  ctx.fillRect(PANEL_PAD + 8, y, panelW - 16, 1);
  y += 9;

  ctx.fillStyle = C.muted;
  ctx.font = `12px ${FONT}`;
  ctx.fillText('Not in voice channel', 52, y + 2);
  y += 18;

  ctx.fillStyle = C.rowHighlight;
  roundRect(ctx, 6, y + 2, panelW - 12, MEMBER_ROW_H - 4, 4);
  ctx.fill();

  const avatarCx = 30;
  const avatarCy = y + MEMBER_ROW_H / 2;
  await drawAvatar(
    ctx,
    target.user.displayAvatarURL({ extension: 'png', size: 128 }),
    avatarCx,
    avatarCy,
  );

  ctx.fillStyle = C.text;
  ctx.font = `600 14px ${FONT}`;
  ctx.fillText(target.displayName.slice(0, 28), 52, y + MEMBER_ROW_H / 2 + 5);

  return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'voice-offline.png' });
}
