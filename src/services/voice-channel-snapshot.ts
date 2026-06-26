import { createCanvas, loadImage } from '@napi-rs/canvas';
import { AttachmentBuilder, type VoiceBasedChannel } from 'discord.js';

const BG = '#2b2d31';
const TEXT = '#dbdee1';
const MUTED = '#ed4245';

export async function renderVoiceChannelSnapshot(
  channel: VoiceBasedChannel,
): Promise<AttachmentBuilder | null> {
  if (!channel.isVoiceBased()) return null;

  const members = [...channel.members.values()].slice(0, 14);
  const width = 380;
  const rowHeight = 44;
  const headerHeight = 52;
  const height = headerHeight + Math.max(members.length, 1) * rowHeight + 12;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = TEXT;
  ctx.font = 'bold 15px Arial, sans-serif';
  ctx.fillText(`🔊 ${channel.name}`.slice(0, 40), 14, 32);

  let y = headerHeight;
  for (const member of members) {
    try {
      const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 64 });
      const img = await loadImage(avatarUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(30, y + 18, 16, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, 14, y + 2, 32, 32);
      ctx.restore();
    } catch {
      ctx.fillStyle = '#4e5058';
      ctx.beginPath();
      ctx.arc(30, y + 18, 16, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = TEXT;
    ctx.font = '13px Arial, sans-serif';
    let label = member.displayName.slice(0, 26);
    const flags: string[] = [];
    if (member.voice.serverMute || member.voice.selfMute) flags.push('M');
    if (member.voice.serverDeaf || member.voice.selfDeaf) flags.push('D');
    if (member.voice.streaming) flags.push('LIVE');
    if (flags.length) label += ` (${flags.join(',')})`;

    ctx.fillText(label, 54, y + 22);

    if (member.voice.serverMute || member.voice.selfMute) {
      ctx.fillStyle = MUTED;
      ctx.font = '11px Arial, sans-serif';
      ctx.fillText('🔇', width - 28, y + 22);
    }

    y += rowHeight;
  }

  if (!members.length) {
    ctx.fillStyle = '#949ba4';
    ctx.font = '13px Arial, sans-serif';
    ctx.fillText('No members in channel', 14, y + 22);
  }

  const buffer = canvas.toBuffer('image/png');
  return new AttachmentBuilder(buffer, { name: 'voice-channel.png' });
}
