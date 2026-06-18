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
}

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
  { type: 'voiceJoin', channelName: 'log-voice-join', label: 'دخول صوتي', group: 'voice' },
  { type: 'voiceLeave', channelName: 'log-voice-leave', label: 'خروج صوتي', group: 'voice' },
  { type: 'voiceChange', channelName: 'log-voice-change', label: 'تغيير روم صوتي', group: 'voice' },
  { type: 'voiceMove', channelName: 'log-voice-move', label: 'نقل صوتي', group: 'voice' },
  { type: 'voiceMute', channelName: 'log-voice-mute', label: 'كتم صوتي', group: 'voice' },
  { type: 'voiceDeafen', channelName: 'log-voice-deafen', label: 'صم صوتي', group: 'voice' },
  { type: 'voiceDisconnect', channelName: 'log-voice-disconnect', label: 'فصل صوتي', group: 'voice' },
  { type: 'serverUpdate', channelName: 'log-server', label: 'تعديل السيرفر', group: 'server' },
  { type: 'inviteCreate', channelName: 'log-invite-create', label: 'إنشاء دعوة', group: 'server' },
  { type: 'inviteDelete', channelName: 'log-invite-delete', label: 'حذف دعوة', group: 'server' },
  { type: 'emojiUpdate', channelName: 'log-emoji', label: 'تعديل إيموجي', group: 'server' },
  { type: 'threadCreate', channelName: 'log-thread', label: 'إنشاء ثريد', group: 'channels' },
  { type: 'modAction', channelName: 'log-mods', label: 'إجراءات الإدارة', group: 'moderation' },
  { type: 'botJoin', channelName: 'log-bots', label: 'دخول بوت', group: 'server' },
];

export const CATEGORY_NAMES = {
  logs: 'SysBot Logs',
  mod: 'SysBot System',
  restricted: 'SysBot Restricted',
} as const;

export const RESTRICTED_CHANNELS = {
  blackText: 'black-text',
  blackVoice: 'black-voice',
  prisonText: 'prison-text',
  prisonVoice: 'prison-voice',
} as const;

export const NEW_CHANNEL_NAME = 'new';
export const VERIFY_CHANNEL_NAME = 'verify';

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
