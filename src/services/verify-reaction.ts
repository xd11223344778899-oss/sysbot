import type { Client, MessageReaction, PartialMessageReaction } from 'discord.js';
import { getGuildConfig } from '../database/guild-config.js';
import {
  completeMemberVerification,
  reverseMemberVerification,
} from './member-gate.js';
import { logModerationAction } from './log-service.js';
import { logger } from '../logger.js';

const VERIFY_REACT_COOLDOWN_MS = 3000;
const verifyReactLast = new Map<string, number>();

export function normalizeEmojiKey(raw: string): string {
  const custom = raw.match(/\d{16,20}/)?.[0];
  return custom ?? raw;
}

export function emojiMatches(stored: string, reactionEmoji: string): boolean {
  return normalizeEmojiKey(stored) === normalizeEmojiKey(reactionEmoji);
}

/**
 * Toggle verification via reaction on the configured verify message.
 * Returns true when the reaction was handled (verify channel message + matching emoji).
 */
export async function handleVerifyReaction(
  client: Client,
  reaction: MessageReaction | PartialMessageReaction,
  userId: string,
  add: boolean,
): Promise<boolean> {
  try {
    if (reaction.partial) await reaction.fetch().catch(() => null);
    const message = reaction.message;
    if (!message.guildId || message.partial) {
      await message.fetch().catch(() => null);
    }
    if (!message.guildId) return false;

    const cfg = await getGuildConfig(message.guildId);
    if (!cfg.verifyEnabled || !cfg.verifyReactionEnabled) return false;
    if (!cfg.verifyReactionMessageId || !cfg.verifyReactionEmoji || !cfg.verifyChannelId) {
      return false;
    }
    if (message.id !== cfg.verifyReactionMessageId) return false;
    if (message.channelId !== cfg.verifyChannelId) return false;

    const emoji = reaction.emoji.id ?? reaction.emoji.name;
    if (!emoji || !emojiMatches(cfg.verifyReactionEmoji, emoji)) return false;

    const guild = await client.guilds.fetch(message.guildId);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member || member.user.bot) return true;

    const rateKey = `${message.guildId}:${userId}`;
    const now = Date.now();
    const last = verifyReactLast.get(rateKey) ?? 0;
    if (now - last < VERIFY_REACT_COOLDOWN_MS) return true;
    verifyReactLast.set(rateKey, now);

    if (!cfg.unverifiedRoleId) return true;

    if (add) {
      if (!member.roles.cache.has(cfg.unverifiedRoleId)) return true;
      await completeMemberVerification(member, cfg);
      void logModerationAction(client, message.guildId, {
        title: 'تفعيل عضو (رياكشن)',
        moderatorId: member.id,
        targetId: member.id,
        targetTag: member.user.tag,
        channelId: message.channelId,
        event: 'verify-reaction',
      });
    } else {
      if (member.roles.cache.has(cfg.unverifiedRoleId)) return true;
      await reverseMemberVerification(member, cfg);
      void logModerationAction(client, message.guildId, {
        title: 'إلغاء تفعيل (رياكشن)',
        moderatorId: member.id,
        targetId: member.id,
        targetTag: member.user.tag,
        channelId: message.channelId,
        event: 'unverify-reaction',
      });
    }

    return true;
  } catch (err) {
    logger.warn({ err }, 'verify reaction error');
    return false;
  }
}
