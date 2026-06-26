import { createCanvas, loadImage } from '@napi-rs/canvas';
import { AttachmentBuilder, type GuildMember, type VoiceBasedChannel } from 'discord.js';
import {
  getVoiceSnapshotIconSource,
  type VoiceSnapshotIconKey,
} from '../shared/log-assets.js';
import { formatChannelCapacity } from '../shared/voice-log-capacity.js';

const BG = '#2b2d31';
const TEXT = '#dbdee1';
const SUBTEXT = '#949ba4';
const MUTED = '#ed4245';
const ICON_SIZE = 18;
const HEADER_ICON_SIZE = 20;
const ICON_PAD = 8;

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

async function drawIcon(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  key: VoiceSnapshotIconKey,
  x: number,
  centerY: number,
  size = ICON_SIZE,
): Promise<number> {
  const img = await loadSnapshotIcon(key);
  if (img) {
    ctx.drawImage(img, x - size, centerY - size / 2, size, size);
    return size + ICON_PAD;
  }
  return 0;
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
      ctx.font = '14px Arial, sans-serif';
      ctx.fillText('🔇', x - 14, centerY + 5);
      x -= 20;
    }
  }
}

async function drawMemberAvatar(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  avatarUrl: string,
  x: number,
  y: number,
): Promise<void> {
  try {
    const img = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + 16, y + 18, 16, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, x, y + 2, 32, 32);
    ctx.restore();
  } catch {
    ctx.fillStyle = '#4e5058';
    ctx.beginPath();
    ctx.arc(x + 16, y + 18, 16, 0, Math.PI * 2);
    ctx.fill();
  }
}

async function drawChannelHeader(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  channelName: string,
): Promise<void> {
  const startX = 14;
  const channelIcon = await loadSnapshotIcon('voiceChannel');
  if (channelIcon) {
    ctx.drawImage(channelIcon, startX, 10, HEADER_ICON_SIZE, HEADER_ICON_SIZE);
    ctx.fillStyle = TEXT;
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.fillText(channelName.slice(0, 34), startX + HEADER_ICON_SIZE + 8, 28);
    return;
  }

  ctx.fillStyle = TEXT;
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.fillText(`🔊 ${channelName}`.slice(0, 36), startX, 28);
}

export async function renderVoiceChannelSnapshot(
  channel: VoiceBasedChannel,
): Promise<AttachmentBuilder | null> {
  if (!channel.isVoiceBased()) return null;

  const members = [...channel.members.values()].slice(0, 14);
  const width = 400;
  const rowHeight = 44;
  const headerHeight = 64;
  const height = headerHeight + Math.max(members.length, 1) * rowHeight + 12;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  await drawChannelHeader(ctx, channel.name);

  const capacity = formatChannelCapacity(channel.members.size, channel.userLimit);
  ctx.fillStyle = SUBTEXT;
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText(`Members: ${capacity}`, 14, 48);

  let y = headerHeight;
  for (const member of members) {
    const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 64 });
    await drawMemberAvatar(ctx, avatarUrl, 14, y);

    ctx.fillStyle = TEXT;
    ctx.font = 'bold 14px Arial, sans-serif';
    const label = member.displayName.slice(0, 28);
    ctx.fillText(label, 54, y + 22);

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
      width - 12,
      y + 20,
    );

    y += rowHeight;
  }

  if (!members.length) {
    ctx.fillStyle = SUBTEXT;
    ctx.font = '13px Arial, sans-serif';
    ctx.fillText('No members in channel', 14, y + 22);
  }

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'voice-channel.png' });
}

export async function renderOfflineVmuteSnapshot(
  target: GuildMember,
): Promise<AttachmentBuilder> {
  const width = 400;
  const height = 140;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = SUBTEXT;
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillText('Target not in voice', 14, 32);

  const avatarUrl = target.user.displayAvatarURL({ extension: 'png', size: 128 });
  await drawMemberAvatar(ctx, avatarUrl, 14, 52);

  ctx.fillStyle = TEXT;
  ctx.font = 'bold 16px Arial, sans-serif';
  ctx.fillText(target.displayName.slice(0, 32), 58, 78);

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'voice-offline.png' });
}
