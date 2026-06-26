import type { EmbedBuilder } from 'discord.js';
import { buildLogEmbed, buildProtectionAlertEmbed, LOG_COLORS, userMention } from './log-embed.js';

export function channelMention(channelId: string): string {
  return `<#${channelId}>`;
}

// --- Members ---

export function botJoinLog(memberId: string, tag: string): EmbedBuilder {
  return buildLogEmbed({
    title: 'دخول بوت',
    color: LOG_COLORS.danger,
    to: userMention(memberId, tag),
    event: 'انضم بوت إلى السيرفر.',
  });
}

export function memberJoinLog(memberId: string, tag: string, createdTimestamp: number): EmbedBuilder {
  return buildLogEmbed({
    title: 'انضمام عضو',
    color: LOG_COLORS.success,
    to: userMention(memberId, tag),
    event: `عمر الحساب: <t:${Math.floor(createdTimestamp / 1000)}:R>`,
  });
}

export function memberLeaveLog(memberId: string, tag: string): EmbedBuilder {
  return buildLogEmbed({
    title: 'مغادرة عضو',
    color: LOG_COLORS.danger,
    to: userMention(memberId, tag),
    event: 'غادر العضو السيرفر.',
  });
}

export function memberBanLog(
  userId: string,
  tag: string,
  by?: string,
  reason?: string,
): EmbedBuilder {
  return buildLogEmbed({
    title: 'حظر',
    color: LOG_COLORS.danger,
    by,
    to: userMention(userId, tag),
    reason,
    event: 'تم حظر العضو من السيرفر.',
  });
}

export function memberUnbanLog(
  userId: string,
  tag: string,
  by?: string,
  reason?: string,
): EmbedBuilder {
  return buildLogEmbed({
    title: 'فك حظر',
    color: LOG_COLORS.success,
    by,
    to: userMention(userId, tag),
    reason,
    event: 'تم فك حظر العضو.',
  });
}

// --- Messages ---

export function messageDeleteLog(opts: {
  by?: string;
  authorId?: string;
  authorTag?: string;
  channelId: string;
  reason?: string;
  content: string;
}): EmbedBuilder {
  return buildLogEmbed({
    title: 'حذف رسالة',
    color: LOG_COLORS.danger,
    by: opts.by,
    to: opts.authorId ? userMention(opts.authorId, opts.authorTag) : undefined,
    in: channelMention(opts.channelId),
    reason: opts.reason,
    event: opts.content,
  });
}

export function messageEditLog(opts: {
  authorId: string;
  authorTag: string;
  channelId: string;
  before: string;
  after: string;
}): EmbedBuilder {
  return buildLogEmbed({
    title: 'تعديل رسالة',
    color: LOG_COLORS.info,
    by: userMention(opts.authorId, opts.authorTag),
    in: channelMention(opts.channelId),
    extra: [
      { name: 'before', value: opts.before.slice(0, 900) },
      { name: 'after', value: opts.after.slice(0, 900) },
    ],
    event: 'تم تعديل محتوى الرسالة.',
  });
}

// --- Channels ---

export function channelCreateLog(
  channelLabel: string,
  channelName: string,
  by?: string,
  reason?: string,
): EmbedBuilder {
  return buildLogEmbed({
    title: 'إنشاء قناة',
    color: LOG_COLORS.success,
    by,
    in: channelLabel,
    reason,
    event: `اسم القناة: ${channelName}`,
  });
}

export function channelDeleteLog(
  channelName: string,
  by?: string,
  reason?: string,
): EmbedBuilder {
  return buildLogEmbed({
    title: 'حذف قناة',
    color: LOG_COLORS.danger,
    by,
    in: `#${channelName}`,
    reason,
    event: 'تم حذف القناة.',
  });
}

export function channelUpdateLog(
  channelLabel: string,
  by?: string,
  reason?: string,
): EmbedBuilder {
  return buildLogEmbed({
    title: 'تعديل قناة',
    color: LOG_COLORS.info,
    by,
    in: channelLabel,
    reason,
    event: 'تم تعديل إعدادات القناة.',
  });
}

export function threadCreateLog(threadId: string, threadName: string): EmbedBuilder {
  return buildLogEmbed({
    title: 'إنشاء ثريد',
    color: LOG_COLORS.success,
    in: channelMention(threadId),
    event: `اسم الثريد: ${threadName}`,
  });
}

// --- Roles ---

export function roleCreateLog(roleName: string, by?: string, reason?: string): EmbedBuilder {
  return buildLogEmbed({
    title: 'إنشاء رول',
    color: LOG_COLORS.success,
    by,
    reason,
    event: `الرول: ${roleName}`,
  });
}

export function roleDeleteLog(roleName: string, by?: string, reason?: string): EmbedBuilder {
  return buildLogEmbed({
    title: 'حذف رول',
    color: LOG_COLORS.danger,
    by,
    reason,
    event: `الرول: ${roleName}`,
  });
}

export function roleUpdateLog(roleName: string, by?: string, reason?: string): EmbedBuilder {
  return buildLogEmbed({
    title: 'تعديل رول',
    color: LOG_COLORS.info,
    by,
    reason,
    event: `الرول: ${roleName}`,
  });
}

export function roleGiveLog(
  memberId: string,
  memberTag: string,
  roleName: string,
  by?: string,
  reason?: string,
): EmbedBuilder {
  return buildLogEmbed({
    title: 'إعطاء رول',
    color: LOG_COLORS.success,
    by,
    to: userMention(memberId, memberTag),
    reason,
    event: `الرول: ${roleName}`,
  });
}

export function roleRemoveLog(
  memberId: string,
  memberTag: string,
  roleName: string,
  by?: string,
  reason?: string,
): EmbedBuilder {
  return buildLogEmbed({
    title: 'سحب رول',
    color: LOG_COLORS.danger,
    by,
    to: userMention(memberId, memberTag),
    reason,
    event: `الرول: ${roleName}`,
  });
}

export function nicknameLog(
  memberId: string,
  memberTag: string,
  oldNick: string | null,
  newNick: string | null,
  by?: string,
  reason?: string,
): EmbedBuilder {
  return buildLogEmbed({
    title: 'تغيير لقب',
    color: LOG_COLORS.info,
    by,
    to: userMention(memberId, memberTag),
    reason,
    event: `${oldNick ?? 'لا شيء'} ← ${newNick ?? 'لا شيء'}`,
  });
}

// --- Server ---

export function serverUpdateLog(serverName: string, by?: string, reason?: string): EmbedBuilder {
  return buildLogEmbed({
    title: 'تعديل السيرفر',
    color: LOG_COLORS.info,
    by,
    reason,
    event: `اسم السيرفر: ${serverName}`,
  });
}

export function inviteCreateLog(
  code: string,
  by?: string,
  channelLabel?: string,
): EmbedBuilder {
  return buildLogEmbed({
    title: 'إنشاء دعوة',
    color: LOG_COLORS.success,
    by,
    in: channelLabel,
    event: `رمز الدعوة: ${code}`,
  });
}

export function inviteDeleteLog(code: string, channelLabel?: string): EmbedBuilder {
  return buildLogEmbed({
    title: 'حذف دعوة',
    color: LOG_COLORS.danger,
    in: channelLabel,
    event: `رمز الدعوة: ${code}`,
  });
}

export function emojiCreateLog(emojiLabel: string, by?: string, reason?: string): EmbedBuilder {
  return buildLogEmbed({
    title: 'إضافة إيموجي',
    color: LOG_COLORS.success,
    by,
    reason,
    event: emojiLabel,
  });
}

// --- Voice ---

export function voiceJoinLog(memberId: string, memberTag: string, channelId: string): EmbedBuilder {
  return buildLogEmbed({
    title: 'دخول صوتي',
    color: LOG_COLORS.success,
    by: userMention(memberId, memberTag),
    to: channelMention(channelId),
    event: 'دخل العضو إلى القناة الصوتية.',
  });
} 

export function voiceLeaveLog(memberId: string, memberTag: string, channelId: string): EmbedBuilder {
  return buildLogEmbed({
    title: 'خروج صوتي',
    color: LOG_COLORS.danger,
    by: userMention(memberId, memberTag),
    in: channelMention(channelId),
    event: 'غادر العضو القناة الصوتية.',
  });
}

export function voiceChangeLog(
  memberId: string,
  memberTag: string,
  fromChannelId: string,
  toChannelId: string,
): EmbedBuilder {
  return buildLogEmbed({
    title: 'تغيير روم صوتي',
    color: LOG_COLORS.info,
    by: userMention(memberId, memberTag),
    to: channelMention(toChannelId),
    from: channelMention(fromChannelId),
    event: 'غيّر العضو رومه الصوتي بنفسه.',
  });
}

export function voiceMoveLog(
  memberId: string,
  memberTag: string,
  modId: string,
  fromChannelId: string,
  toChannelId: string,
  reason?: string,
): EmbedBuilder {
  return buildLogEmbed({
    title: 'نقل صوتي',
    color: LOG_COLORS.info,
    by: userMention(modId),
    to: userMention(memberId, memberTag),
    in: channelMention(toChannelId),
    from: channelMention(fromChannelId),
    reason,
    event: 'تم نقل العضو بين القنوات الصوتية.',
  });
}

export function voiceDisconnectLog(
  memberId: string,
  memberTag: string,
  modId: string,
  channelId: string,
  reason?: string,
): EmbedBuilder {
  return buildLogEmbed({
    title: 'فصل صوتي',
    color: LOG_COLORS.danger,
    by: userMention(modId),
    to: userMention(memberId, memberTag),
    in: channelMention(channelId),
    reason,
    event: 'تم فصل العضو من القناة الصوتية.',
  });
}

export function voiceMuteLog(opts: {
  memberId: string;
  memberTag: string;
  channelId?: string;
  by?: string;
  reason?: string;
  muted: boolean;
}): EmbedBuilder {
  return buildLogEmbed({
    title: 'كتم صوتي',
    color: LOG_COLORS.info,
    by: opts.by,
    to: userMention(opts.memberId, opts.memberTag),
    in: opts.channelId ? channelMention(opts.channelId) : undefined,
    reason: opts.reason,
    event: opts.muted ? 'تم كتم العضو في الصوت.' : 'تم فك كتم العضو في الصوت.',
  });
}

export function voiceDeafenLog(opts: {
  memberId: string;
  memberTag: string;
  channelId?: string;
  by?: string;
  reason?: string;
  deafened: boolean;
}): EmbedBuilder {
  return buildLogEmbed({
    title: 'صم صوتي',
    color: LOG_COLORS.info,
    by: opts.by,
    to: userMention(opts.memberId, opts.memberTag),
    in: opts.channelId ? channelMention(opts.channelId) : undefined,
    reason: opts.reason,
    event: opts.deafened ? 'تم صم العضو في الصوت.' : 'تم فك صم العضو في الصوت.',
  });
}

// --- Moderation / protection ---

export type ProtectionViolation =
  | 'channelCreate'
  | 'channelDelete'
  | 'roleDelete'
  | 'rolePerms';

const PROTECTION_ATTEMPT_TEXT: Record<ProtectionViolation, string> = {
  channelCreate: "Was trying to create a 1 channel's",
  channelDelete: 'Was trying to delete a channel',
  roleDelete: 'Was trying to delete a role',
  rolePerms: 'Was trying to edit role permissions',
};

const PROTECTION_CODE_TITLE: Record<ProtectionViolation, string> = {
  channelCreate: 'Missing Permissions',
  channelDelete: 'Anti Delete',
  roleDelete: 'Anti Delete',
  rolePerms: 'Anti Perms',
};

export function protectionAlertLog(opts: {
  guildName: string;
  guildIconUrl?: string | null;
  memberId: string;
  violation: ProtectionViolation;
  strikeCount: number;
  strikeLimit: number;
  auditReason?: string;
  thumbnailUrl?: string | null;
}): EmbedBuilder {
  const detail = opts.auditReason?.trim()
    ? `❌ ${opts.auditReason.trim()}`
    : `❌ ${opts.strikeCount}/${opts.strikeLimit} Strikes`;

  return buildProtectionAlertEmbed({
    guildName: opts.guildName,
    guildIconUrl: opts.guildIconUrl,
    targetId: opts.memberId,
    attemptText: PROTECTION_ATTEMPT_TEXT[opts.violation],
    codeTitle: PROTECTION_CODE_TITLE[opts.violation],
    codeDetail: detail,
    thumbnailUrl: opts.thumbnailUrl,
  });
}
