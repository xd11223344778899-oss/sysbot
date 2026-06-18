import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import type { Command } from '../types/command.js';
import { config } from '../config.js';
import { prisma } from '../database/prisma.js';
import { OWNER_RESTRICTED_COMMANDS } from '../shared/constants.js';
import { getInteractiveAllowedCommands } from '../services/interactive-role-panel.js';
import {
  getAdminRoleAllowedCommands,
  memberHasDiscordAdministrator,
} from '../services/admin-role-panel.js';

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

/** Global ALLOW list — grants owner-restricted commands only (not blanket mod access). */
async function isOnAllowList(
  guildId: string,
  userId: string,
  roleIds: string[],
): Promise<boolean> {
  const allowed = await prisma.accessEntry.findFirst({
    where: {
      guildId,
      mode: 'ALLOW',
      targetId: { in: [userId, ...roleIds] },
    },
  });
  return Boolean(allowed);
}

function isManageGuildAdmin(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.ManageGuild);
}

/**
 * Resolves whether a member may run a command.
 * Order: owner -> deny -> disabled -> owner-restricted (allow list only) -> per-command allow -> level check.
 */
export async function checkPermission(
  member: GuildMember,
  command: Command,
): Promise<PermissionResult> {
  const guildId = member.guild.id;
  const userId = member.id;
  const roleIds = member.roles.cache.map((r) => r.id);

  const owner = await isOwner(guildId, userId);
  if (owner) return { allowed: true };

  const denied = await prisma.accessEntry.findFirst({
    where: {
      guildId,
      mode: 'DENY',
      targetId: { in: [userId, ...roleIds] },
    },
  });
  if (denied) return { allowed: false, reason: 'أنت محظور من استخدام الأوامر.' };

  const cmdConfig = await prisma.commandConfig.findUnique({
    where: { guildId_commandName: { guildId, commandName: command.name } },
  });
  if (cmdConfig && !cmdConfig.enabled) {
    return { allowed: false, reason: 'هذا الأمر معطّل في هذا السيرفر.' };
  }

  const ownerRestricted =
    OWNER_RESTRICTED_COMMANDS.has(command.name) || command.permission === 'owner';

  if (ownerRestricted) {
    if (await isOnAllowList(guildId, userId, roleIds)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: 'هذا الأمر مخصص لمالكي البوت أو قائمة السماح فقط.',
    };
  }

  if (cmdConfig) {
    const allowedUsers = parseIdList(cmdConfig.allowedUserIds);
    const allowedRoles = parseIdList(cmdConfig.allowedRoleIds);
    const explicitlyAllowed =
      allowedUsers.includes(userId) || allowedRoles.some((id) => roleIds.includes(id));
    if (explicitlyAllowed) return { allowed: true };
  }

  if (command.permission === 'everyone') return { allowed: true };

  if (command.permission === 'admin') {
    if (memberHasDiscordAdministrator(member)) return { allowed: true };
    const adminCmds = await getAdminRoleAllowedCommands(guildId, roleIds);
    if (adminCmds.has(command.name)) return { allowed: true };
    if (isManageGuildAdmin(member)) return { allowed: true };
    return { allowed: false, reason: 'هذا الأمر يحتاج صلاحية إدارة.' };
  }

  if (isManageGuildAdmin(member) || memberHasDiscordAdministrator(member)) {
    return { allowed: true };
  }

  const interactiveCmds = await getInteractiveAllowedCommands(guildId, roleIds);
  if (interactiveCmds.has(command.name)) return { allowed: true };

  const adminCmds = await getAdminRoleAllowedCommands(guildId, roleIds);
  if (adminCmds.has(command.name)) return { allowed: true };

  return { allowed: false, reason: 'ليس لديك صلاحية لاستخدام هذا الأمر.' };
}
