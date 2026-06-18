import { PermissionFlagsBits, type Message } from 'discord.js';
import { getGuildConfig } from '../database/guild-config.js';
import { prisma } from '../database/prisma.js';
import { isTrusted } from './trust-service.js';

function isStaff(message: Message<true>): boolean {
  return message.member?.permissions.has(PermissionFlagsBits.ManageMessages) ?? false;
}

/**
 * Enforces pic/here baseline on messages. Returns true if message was deleted.
 */
export async function runMessagePermissionGuard(message: Message<true>): Promise<boolean> {
  const cfg = await getGuildConfig(message.guildId);
  if (!cfg.decorBaselineEnabled) return false;
  if (!message.member || message.author.bot) return false;
  if (isStaff(message)) return false;
  if (await isTrusted(message.guildId, message.author.id)) return false;

  const blacklistedChat = await prisma.blacklistChat.findUnique({
    where: { guildId_channelId: { guildId: message.guildId, channelId: message.channelId } },
  });
  if (blacklistedChat) return false;

  if (cfg.logCategory && message.channel.parentId === cfg.logCategory) return false;

  const perms = message.member.permissions;
  let shouldDelete = false;

  if (
    (message.attachments.size > 0 || message.embeds.some((e) => e.image || e.thumbnail)) &&
    !perms.has(PermissionFlagsBits.AttachFiles)
  ) {
    shouldDelete = true;
  }

  if (
    !shouldDelete &&
    (message.mentions.everyone || message.content.includes('@here')) &&
    !perms.has(PermissionFlagsBits.MentionEveryone)
  ) {
    shouldDelete = true;
  }

  if (shouldDelete) {
    await message.delete().catch(() => {});
    return true;
  }
  return false;
}
