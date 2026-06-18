import { PermissionFlagsBits, type Guild, type GuildMember, type Role } from 'discord.js';
import { isOwner } from '../core/permission-engine.js';
import { isTrusted } from './trust-service.js';
import { getGuildAdminRoleIds } from './admin-role-panel.js';
import {
  checkAdminHierarchy,
  getMemberAdminRank,
} from './admin-hierarchy.js';

export interface ModerationCheckResult {
  allowed: boolean;
  reason?: string;
}

/** Whether moderator may act on target (hierarchy, guild owner, bot owner, trusted). */
export async function canModerate(
  moderator: GuildMember,
  target: GuildMember,
): Promise<ModerationCheckResult> {
  if (target.id === moderator.id) {
    return { allowed: false, reason: 'لا يمكنك تنفيذ هذا الإجراء على نفسك.' };
  }
  if (target.id === moderator.guild.ownerId) {
    return { allowed: false, reason: 'لا يمكن تنفيذ هذا الإجراء على مالك السيرفر.' };
  }
  if (await isOwner(moderator.guild.id, target.id)) {
    return { allowed: false, reason: 'لا يمكن تنفيذ هذا الإجراء على مالك البوت.' };
  }
  if (await isTrusted(moderator.guild.id, target.id)) {
    return { allowed: false, reason: 'هذا العضو في قائمة الثقة (محمي من الإجراءات).' };
  }

  const hierarchy = await checkAdminHierarchy(moderator, target, { voiceMove: false });
  if (hierarchy.status === 'denied') {
    return { allowed: false, reason: hierarchy.reason };
  }
  if (hierarchy.status === 'voice_consent_required') {
    return {
      allowed: false,
      reason: hierarchy.reason ?? 'لا يمكنك تنفيذ هذا الإجراء — استخدم طلب الموافقة للسحب الصوتي فقط.',
    };
  }

  const targetAdminRank = await getMemberAdminRank(moderator.guild.id, target);
  if (targetAdminRank !== null) {
    return { allowed: true };
  }

  if (moderator.id !== moderator.guild.ownerId) {
    if (target.roles.highest.position >= moderator.roles.highest.position) {
      return { allowed: false, reason: 'لا يمكنك تنفيذ إجراء على عضو برول أعلى أو مساوٍ لرولك.' };
    }
  }
  return { allowed: true };
}

export interface RoleSafetyResult {
  safe: boolean;
  reason?: string;
}

/** Reject dangerous or unmanageable roles for assignment via bot commands. */
export async function validateRoleForAssignment(
  guild: Guild,
  role: Role,
  actor?: GuildMember,
): Promise<RoleSafetyResult> {
  if (role.managed) {
    return { safe: false, reason: 'لا يمكن التعامل مع رولات مُدارة من تطبيق خارجي.' };
  }
  if (role.id === guild.id) {
    return { safe: false, reason: 'لا يمكن التعامل مع رول everyone.' };
  }
  if (role.permissions.has(PermissionFlagsBits.Administrator)) {
    return { safe: false, reason: 'لا يمكن إعطاء أو إعداد رول بصلاحية Administrator.' };
  }
  const adminRoleIds = await getGuildAdminRoleIds(guild.id);
  if (adminRoleIds.has(role.id)) {
    return { safe: false, reason: 'لا يمكن إعطاء أو إعداد رول مسجّل كرول إداري.' };
  }
  const botMember = guild.members.me;
  if (botMember && role.position >= botMember.roles.highest.position) {
    return { safe: false, reason: 'رول البوت أقل من هذا الرول — لا يمكن للبوت إدارته.' };
  }
  if (actor && actor.id !== guild.ownerId && role.position >= actor.roles.highest.position) {
    return { safe: false, reason: 'لا يمكنك التعامل مع رول أعلى من رولك أو مساوٍ له.' };
  }
  return { safe: true };
}

export async function canModifyRoleOnMember(
  actor: GuildMember,
  target: GuildMember,
  role: Role,
  guild: Guild,
): Promise<RoleSafetyResult> {
  const modCheck = await canModerate(actor, target);
  if (!modCheck.allowed) return { safe: false, reason: modCheck.reason };

  const roleCheck = await validateRoleForAssignment(guild, role, actor);
  if (!roleCheck.safe) return roleCheck;

  return { safe: true };
}
