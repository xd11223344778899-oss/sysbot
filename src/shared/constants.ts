// System role definitions created during setup (neutral formal colors, no emojis in names).
export const SYSTEM_ROLES = {
  muted: { key: 'mutedRoleId', name: 'Muted', color: 0x78909c },
  prison: { key: 'prisonRoleId', name: 'Prison', color: 0x607d8c },
  blacklisted: { key: 'blacklistedRoleId', name: 'Blacklisted', color: 0x455a64 },
  vmute: { key: 'vmuteRoleId', name: 'Voice-Muted', color: 0x546e7a },
  new: { key: 'newRoleId', name: 'New', color: 0xb0bec5 },
  unverified: { key: 'unverifiedRoleId', name: 'Unverified', color: 0x757575 },
  pic: { key: 'picRoleId', name: 'Pic', color: 0x90a4ae },
  here: { key: 'hereRoleId', name: 'Here', color: 0x90a4ae },
  live: { key: 'liveRoleId', name: 'Live', color: 0x90a4ae },
} as const;

// Every loggable event. The detailed mode creates a channel per entry; the
// compact mode groups entries that share a `group` into one channel.
export interface LogEventDef {
  type: string;
  channelName: string;
  label: string;
  group: string;
  /** Discord category key — defaults to `logs`. */
  category?: keyof typeof LOG_CATEGORIES;
}

export const LOG_CATEGORIES = {
  logs: 'SysBot Logs',
  activeLogs: 'active logs',
  mod: 'SysBot System',
  restricted: 'SysBot Restricted',
} as const;

export const LOG_EVENTS: LogEventDef[] = [
  { type: 'memberJoin', channelName: 'log-join', label: 'انضمام عضو', group: 'members' },
  { type: 'memberLeave', channelName: 'log-leave', label: 'مغادرة عضو', group: 'members' },
  { type: 'memberBan', channelName: 'log-ban', label: 'حظر', group: 'moderation' },
  { type: 'memberUnban', channelName: 'log-unban', label: 'فك حظر', group: 'moderation' },
  { type: 'memberKick', channelName: 'log-kick', label: 'طرد', group: 'moderation' },
  { type: 'memberUpdate', channelName: 'log-member-update', label: 'تعديل عضو', group: 'members' },
  { type: 'nickname', channelName: 'log-nickname', label: 'تغيير لقب', group: 'members' },
  { type: 'roleGive', channelName: 'log-role-give', label: 'إعطاء رول', group: 'roles' },
  { type: 'roleRemove', channelName: 'log-role-remove', label: 'سحب رول', group: 'roles' },
  { type: 'roleCreate', channelName: 'log-role-create', label: 'إنشاء رول', group: 'roles' },
  { type: 'roleDelete', channelName: 'log-role-delete', label: 'حذف رول', group: 'roles' },
  { type: 'roleUpdate', channelName: 'log-role-update', label: 'تعديل رول', group: 'roles' },
  { type: 'channelCreate', channelName: 'log-channel-create', label: 'إنشاء قناة', group: 'channels' },
  { type: 'channelDelete', channelName: 'log-channel-delete', label: 'حذف قناة', group: 'channels' },
  { type: 'channelUpdate', channelName: 'log-channel-update', label: 'تعديل قناة', group: 'channels' },
  { type: 'messageDelete', channelName: 'log-msg-delete', label: 'حذف رسالة', group: 'messages' },
  { type: 'messageEdit', channelName: 'log-msg-edit', label: 'تعديل رسالة', group: 'messages' },
  { type: 'voiceJoin', channelName: 'log-join-channel', label: 'دخول صوتي', group: 'active-voice', category: 'activeLogs' },
  { type: 'voiceLeave', channelName: 'log-leave-channel', label: 'خروج صوتي', group: 'active-voice', category: 'activeLogs' },
  { type: 'voiceChange', channelName: 'log-change-channel', label: 'تغيير روم صوتي', group: 'active-voice', category: 'activeLogs' },
  { type: 'voiceMove', channelName: 'log-move-members', label: 'نقل صوتي', group: 'active-voice', category: 'activeLogs' },
  { type: 'voiceDisconnect', channelName: 'log-discounect-members', label: 'فصل صوتي', group: 'active-voice', category: 'activeLogs' },
  { type: 'voiceMute', channelName: 'log-voice-mute', label: 'كتم صوتي', group: 'active-voice', category: 'activeLogs' },
  { type: 'voiceUnmute', channelName: 'log-un-voice-mute', label: 'فك كتم صوتي', group: 'active-voice', category: 'activeLogs' },
  { type: 'voiceDeafen', channelName: 'log-voice-deafen', label: 'صم صوتي', group: 'active-voice', category: 'activeLogs' },
  { type: 'voiceUndeafen', channelName: 'log-un-voice-deafen', label: 'فك صم صوتي', group: 'active-voice', category: 'activeLogs' },
  { type: 'voiceSelfMute', channelName: 'log-self-voice-actions', label: 'كتم ذاتي', group: 'active-voice', category: 'activeLogs' },
  { type: 'voiceSelfDeafen', channelName: 'log-self-voice-actions', label: 'صم ذاتي', group: 'active-voice', category: 'activeLogs' },
  { type: 'serverUpdate', channelName: 'log-server', label: 'تعديل السيرفر', group: 'server' },
  { type: 'inviteCreate', channelName: 'log-invite-create', label: 'إنشاء دعوة', group: 'server' },
  { type: 'inviteDelete', channelName: 'log-invite-delete', label: 'حذف دعوة', group: 'server' },
  { type: 'emojiUpdate', channelName: 'log-emoji', label: 'تعديل إيموجي', group: 'server' },
  { type: 'threadCreate', channelName: 'log-thread', label: 'إنشاء ثريد', group: 'channels' },
  { type: 'modAction', channelName: 'log-mods', label: 'إجراءات الإدارة', group: 'moderation' },
  {
    type: 'protection',
    channelName: 'log-protection',
    label: 'تنبيهات الحماية',
    group: 'protection',
  },
  { type: 'botJoin', channelName: 'log-bots', label: 'دخول بوت', group: 'server' },
];

export const CATEGORY_NAMES = {
  logs: LOG_CATEGORIES.logs,
  activeLogs: LOG_CATEGORIES.activeLogs,
  mod: LOG_CATEGORIES.mod,
  restricted: LOG_CATEGORIES.restricted,
} as const;

export const RESTRICTED_CHANNELS = {
  blackText: 'black-text',
  blackVoice: 'black-voice',
  prisonText: 'prison-text',
  prisonVoice: 'prison-voice',
} as const;

export const NEW_CHANNEL_NAME = 'new';
export const VERIFY_CHANNEL_NAME = 'verify';

/**
 * Baseline commands every configured admin role receives automatically
 * (no Discord Administrator permission required).
 */
export const AUTO_ADMIN_BASELINE_COMMANDS = new Set([
  'move',
  'moveme',
  'clear',
  'mute',
  'unmute',
  'vmute',
  'unvmute',
  'warn',
  'wlist',
  'mymute',
  'myprison',
  'myvmute',
  'mypenalties',
  'records',
  'role',
  'info',
  'link',
  'color',
  'colors',
  'mcolors',
  'change',
  'avatar',
  'banner',
]);

/** Mod commands grantable via interactive roles. */
export const INTERACTIVE_GRANTABLE_COMMANDS = [
  'mute',
  'unmute',
  'prison',
  'unprison',
  'vmute',
  'unvmute',
  'clear',
  'kick',
  'warn',
  'black',
  'unblack',
] as const;

/**
 * Bot-management commands: owners + ALLOW list only (trust is protection-only).
 * Discord Administrator alone does NOT grant these.
 */
export const OWNER_RESTRICTED_COMMANDS = new Set([
  'vip',
  'doadd',
  'dochange',
  'doremove',
  'dolist',
  'allow',
  'deny',
  'list',
  'cmd',
  'settings',
  'setbanmsg',
  'setchannel',
  'setnew',
  'unsetnew',
  'setverify',
  'unsetverify',
  'setverifyreact',
  'unsetverifyreact',
  'setpadmin',
  'resons',
  'pallow',
  'plist',
  'slowmode',
  'setname',
  'setavatar',
  'setbanner',
  'setowner',
  'owners',
  'setprefix',
  'setnprefix',
  'setactivity',
  'setstatus',
  'restart',
  'rolemulti',
  'autorole',
  'lsetup',
  'logs',
  'lremove',
  'antidelete',
  'antilinks',
  'antiperms',
  'antibots',
  'antiword',
  'spam',
  'antijoin',
  'setrjoin',
  'bblack',
  'trustuser',
  'trustlist',
  'createlimit',
  'protection',
  'wanti',
  'wantilist',
  'collection',
  'ecollection',
  'setcolors',
  'setpcolor',
  'setpic',
  'unpic',
  'restore',
  'settask',
  'task',
  'say',
  'dm',
  'addemoji',
  'sticker',
  'aroles',
  'iroles',
  'verifyall',
]);
