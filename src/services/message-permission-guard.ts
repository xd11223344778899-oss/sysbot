import { PermissionFlagsBits, type Message } from 'discord.js';
import { getGuildConfig } from '../database/guild-config.js';
import { prisma } from '../database/prisma.js';
import { isTrusted } from './trust-service.js';

function hasPicRole(message: Message<true>, picRoleId: string | null): boolean {
  if (!picRoleId || !message.member) return false;
  return message.member.roles.cache.has(picRoleId);
}

function hasHereRole(message: Message<true>, hereRoleId: string | null): boolean {
  if (!hereRoleId || !message.member) return false;
  return message.member.roles.cache.has(hereRoleId);
}

async function hasInteractiveGrant(
  guildId: string,
  member: NonNullable<Message<true>['member']>,
  field: 'attachFiles' | 'mentionEveryone',
): Promise<boolean> {
  const roleIds = [...member.roles.cache.keys()];
  if (roleIds.length === 0) return false;
  const rows = await prisma.interactiveRole.findMany({
    where: { guildId, roleId: { in: roleIds }, [field]: true },
    select: { id: true },
    take: 1,
  });
  return rows.length > 0;
}

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

  let shouldDelete = false;

  if (
    (message.attachments.size > 0 || message.embeds.some((e) => e.image || e.thumbnail)) &&
    !hasPicRole(message, cfg.picRoleId) &&
    !(await hasInteractiveGrant(message.guildId, message.member, 'attachFiles'))
  ) {
    shouldDelete = true;
  }

  if (
    !shouldDelete &&
    (message.mentions.everyone || message.content.includes('@here')) &&
    !hasHereRole(message, cfg.hereRoleId) &&
    !(await hasInteractiveGrant(message.guildId, message.member, 'mentionEveryone'))
  ) {
    shouldDelete = true;
  }

  if (shouldDelete) {
    await message.delete().catch(() => {});
    return true;
  }
  return false;
}
