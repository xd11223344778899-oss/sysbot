import { PermissionFlagsBits, type Message } from 'discord.js';
import { getGuildConfig } from '../database/guild-config.js';
import { prisma } from '../database/prisma.js';
import { applyPenalty } from './penalty-service.js';

const LINK_RE = /(https?:\/\/|www\.|discord\.gg\/)/i;

// userId -> recent message timestamps, for spam detection.
const spamTracker = new Map<string, number[]>();

function isStaff(message: Message<true>): boolean {
  return (
    message.member?.permissions.has(PermissionFlagsBits.ManageMessages) ?? false
  );
}

/**
 * Runs message-level protection. Returns true if the message was removed
 * (so the command parser should skip it).
 */
export async function runAutoModeration(message: Message<true>): Promise<boolean> {
  const cfg = await getGuildConfig(message.guildId);
  if (isStaff(message)) return false;

  if (cfg.antiLinks && LINK_RE.test(message.content)) {
    await message.delete().catch(() => {});
    return true;
  }

  if (cfg.antiWord && cfg.bannedWords.length) {
    const lower = message.content.toLowerCase();
    if (cfg.bannedWords.some((w) => lower.includes(w.toLowerCase()))) {
      await message.delete().catch(() => {});
      if (cfg.mutedRoleId && message.member) {
        await applyPenalty({
          member: message.member,
          type: 'MUTE',
          moderatorId: message.client.user!.id,
          reason: 'antiword',
        }).catch(() => {});
      }
      return true;
    }
  }

  if (cfg.spamEnabled) {
    const key = `${message.guildId}:${message.author.id}`;
    const now = Date.now();
    const windowMs = cfg.spamSeconds * 1000;
    const times = (spamTracker.get(key) ?? []).filter((t) => now - t < windowMs);
    times.push(now);
    spamTracker.set(key, times);
    if (times.length > cfg.spamMessages) {
      await message.delete().catch(() => {});
      return true;
    }
  }

  return false;
}

/** Auto chat decorations: line separators, reactions, embed pics. */
export async function runAutoFeatures(message: Message<true>): Promise<void> {
  const cfg = await getGuildConfig(message.guildId);
  const isBlack = await prisma.blacklistChat.findUnique({
    where: { guildId_channelId: { guildId: message.guildId, channelId: message.channelId } },
  });
  if (isBlack) return;

  if (cfg.autoReact && cfg.reactEmoji) {
    await message.react(cfg.reactEmoji).catch(() => {});
  }
  if (cfg.autoLine && message.channel.isTextBased() && 'send' in message.channel) {
    await message.channel.send('━━━━━━━━━━━━━━━━━━').catch(() => {});
  }
}
