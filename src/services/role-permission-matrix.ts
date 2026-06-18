import { PermissionFlagsBits, type PermissionResolvable } from 'discord.js';
import { SYSTEM_ROLES } from '../shared/constants.js';

/** System role keys managed by SysBot setup/sync. */
export type SystemRoleKey = keyof typeof SYSTEM_ROLES;

/** Guild-level permissions per system role (exact set — no extras). */
export const GUILD_ROLE_PERMISSIONS: Record<SystemRoleKey, bigint> = {
  pic: PermissionFlagsBits.AttachFiles,
  here: PermissionFlagsBits.MentionEveryone,
  live: PermissionFlagsBits.Stream,
  muted: 0n,
  prison: 0n,
  blacklisted: 0n,
  unverified: 0n,
  new: 0n,
  vmute: 0n,
};

/** Roles that receive channel overwrites on every synced channel. */
export const CHANNEL_OVERWRITE_ROLE_KEYS: SystemRoleKey[] = [
  'muted',
  'prison',
  'blacklisted',
  'unverified',
];

/** Decor roles: guild permissions only — never channel overwrites. */
export const DECOR_GUILD_ROLE_KEYS: SystemRoleKey[] = ['pic', 'here', 'live'];

/** Strip from @everyone at guild level (and reset in channel overwrites during cleanup). */
export const EVERYONE_STRIP_FLAGS: PermissionResolvable[] = [
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.Stream,
  PermissionFlagsBits.UseEmbeddedActivities,
];

/** Channel @everyone keys to reset to inherit during cleanup. */
export const EVERYONE_CHANNEL_RESET = {
  AttachFiles: null,
  EmbedLinks: null,
  MentionEveryone: null,
  Stream: null,
  UseEmbeddedActivities: null,
} as const;

export function guildPermissionsForRole(key: SystemRoleKey): bigint {
  return GUILD_ROLE_PERMISSIONS[key];
}

export function buildInteractiveGuildPermissions(opts: {
  attachFiles: boolean;
  mentionEveryone: boolean;
  stream: boolean;
  muteMembers: boolean;
  deafenMembers: boolean;
}): bigint {
  let bits = 0n;
  if (opts.attachFiles) bits |= PermissionFlagsBits.AttachFiles;
  if (opts.mentionEveryone) bits |= PermissionFlagsBits.MentionEveryone;
  if (opts.stream) bits |= PermissionFlagsBits.Stream;
  if (opts.muteMembers) bits |= PermissionFlagsBits.MuteMembers;
  if (opts.deafenMembers) bits |= PermissionFlagsBits.DeafenMembers;
  return bits;
}

export function decorRoleIdsFromContext(ctx: {
  picRoleId: string | null;
  hereRoleId: string | null;
  liveRoleId: string | null;
}): string[] {
  return [ctx.picRoleId, ctx.hereRoleId, ctx.liveRoleId].filter((id): id is string => Boolean(id));
}
