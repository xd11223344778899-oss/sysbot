import { type Guild } from 'discord.js';
import { SYSTEM_ROLES } from '../shared/constants.js';
import {
  EVERYONE_STRIP_FLAGS,
  GUILD_ROLE_PERMISSIONS,
  type SystemRoleKey,
} from './role-permission-matrix.js';
import { logger } from '../logger.js';

export interface RoleNormalizeStats {
  everyoneFixed: boolean;
  rolesFixed: number;
  rolesSkipped: number;
}

export async function normalizeEveryoneRole(guild: Guild): Promise<boolean> {
  const everyone = guild.roles.everyone;
  const before = everyone.permissions.bitfield;
  const next = everyone.permissions.remove(EVERYONE_STRIP_FLAGS);
  if (next.bitfield === before) return false;
  try {
    await everyone.setPermissions(next, 'SysBot: normalize @everyone baseline');
    return true;
  } catch (err) {
    logger.warn({ err, guildId: guild.id }, 'Failed to normalize @everyone');
    return false;
  }
}

export async function normalizeSystemRole(guild: Guild, key: SystemRoleKey, roleId: string): Promise<boolean> {
  const role = guild.roles.cache.get(roleId);
  if (!role) return false;
  const target = GUILD_ROLE_PERMISSIONS[key];
  if (role.permissions.bitfield === target) return false;
  try {
    await role.setPermissions(target, `SysBot: normalize ${SYSTEM_ROLES[key].name}`);
    return true;
  } catch (err) {
    logger.warn({ err, guildId: guild.id, roleId, key }, 'Failed to normalize system role');
    return false;
  }
}

export async function normalizeAllSystemRoles(
  guild: Guild,
  roleIds: Record<string, string>,
): Promise<RoleNormalizeStats> {
  const stats: RoleNormalizeStats = { everyoneFixed: false, rolesFixed: 0, rolesSkipped: 0 };
  stats.everyoneFixed = await normalizeEveryoneRole(guild);

  for (const key of Object.keys(SYSTEM_ROLES) as SystemRoleKey[]) {
    const def = SYSTEM_ROLES[key];
    const roleId = roleIds[def.key];
    if (!roleId) {
      stats.rolesSkipped += 1;
      continue;
    }
    const fixed = await normalizeSystemRole(guild, key, roleId);
    if (fixed) stats.rolesFixed += 1;
  }
  return stats;
}
