import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import type { Command } from '../types/command.js';
import { config } from '../config.js';
import { prisma } from '../database/prisma.js';

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

function parseIdList(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function isOwner(guildId: string, userId: string): Promise<boolean> {
  if (config.globalOwners.includes(userId)) return true;
  const owner = await prisma.botOwner.findUnique({
    where: { guildId_userId: { guildId, userId } },
  });
  return Boolean(owner);
}

function isAdmin(member: GuildMember): boolean {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

/**
 * Resolves whether a member may run a command.
 * Order: owner -> deny-list -> per-command config -> allow-list -> level check.
 */
export async function checkPermission(
  member: GuildMember,
  command: Command,
): Promise<PermissionResult> {
  const guildId = member.guild.id;
  const userId = member.id;

  const owner = await isOwner(guildId, userId);
  if (owner) return { allowed: true };

  const roleIds = member.roles.cache.map((r) => r.id);

  // deny-list short-circuits everything (except owners, handled above).
  const denied = await prisma.accessEntry.findFirst({
    where: {
      guildId,
      mode: 'DENY',
      targetId: { in: [userId, ...roleIds] },
    },
  });
  if (denied) return { allowed: false, reason: 'أنت محظور من استخدام الأوامر.' };

  // Per-command configuration (cmd command): disabled or explicit allow lists.
  const cmdConfig = await prisma.commandConfig.findUnique({
    where: { guildId_commandName: { guildId, commandName: command.name } },
  });
  if (cmdConfig && !cmdConfig.enabled) {
    return { allowed: false, reason: 'هذا الأمر معطّل في هذا السيرفر.' };
  }
  if (cmdConfig) {
    const allowedUsers = parseIdList(cmdConfig.allowedUserIds);
    const allowedRoles = parseIdList(cmdConfig.allowedRoleIds);
    const explicitlyAllowed =
      allowedUsers.includes(userId) || allowedRoles.some((id) => roleIds.includes(id));
    if (explicitlyAllowed) return { allowed: true };
  }

  if (command.permission === 'owner') {
    return { allowed: false, reason: 'هذا الأمر مخصص لمالكي البوت فقط.' };
  }

  // Global allow-list grants mod-level access.
  const allowed = await prisma.accessEntry.findFirst({
    where: {
      guildId,
      mode: 'ALLOW',
      targetId: { in: [userId, ...roleIds] },
    },
  });

  if (command.permission === 'everyone') return { allowed: true };

  if (command.permission === 'admin') {
    if (isAdmin(member)) return { allowed: true };
    return { allowed: false, reason: 'هذا الأمر يحتاج صلاحية إدارة.' };
  }

  // 'mod'
  if (isAdmin(member) || allowed) return { allowed: true };
  return { allowed: false, reason: 'ليس لديك صلاحية لاستخدام هذا الأمر.' };
}
