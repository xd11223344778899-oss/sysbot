import type { Message, Client, Guild as DiscordGuild, GuildMember } from 'discord.js';
import type { GuildConfig } from '../database/guild-config.js';

export type CommandCategory =
  | 'vip'
  | 'moderation'
  | 'channels'
  | 'roles'
  | 'logging'
  | 'protection'
  | 'points'
  | 'customization'
  | 'utility'
  | 'colors';

/**
 * Required permission level to run a command.
 * - `owner`   : bot owners only (global owners or guild bot-owners)
 * - `admin`   : members with Discord Administrator / ManageGuild
 * - `mod`     : members granted via allow-list or moderation perms
 * - `everyone`: any member (still subject to deny-list)
 */
export type PermissionLevel = 'owner' | 'admin' | 'mod' | 'everyone';

export interface CommandContext {
  client: Client;
  message: Message<true>;
  guild: DiscordGuild;
  member: GuildMember;
  args: string[];
  /** Raw text after the command name. */
  rest: string;
  config: GuildConfig;
}

export interface Command {
  /** Primary invocation name (no prefix). */
  name: string;
  /** Alternate names. */
  aliases?: string[];
  /** Short description shown in the commands list (matches the spec). */
  description: string;
  category: CommandCategory;
  permission: PermissionLevel;
  /**
   * When true the command is ALWAYS recognised without the guild prefix
   * (typed as the bare word anywhere, including text-in-voice channels),
   * regardless of the guild's no-prefix mode. By default commands need the
   * prefix unless the guild has enabled no-prefix mode via `setnprefix`.
   */
  noPrefix?: boolean;
  /** Usage hint, e.g. "<@user> [reason]". */
  usage?: string;
  execute(ctx: CommandContext): Promise<unknown> | unknown;
}
