import type { Message } from 'discord.js';
import { registry } from './command-registry.js';
import { resolveAliasCommand } from '../services/alias-resolver.js';
import { checkPermission } from './permission-engine.js';
import { getGuildConfig } from '../database/guild-config.js';
import { errorEmbed } from '../shared/embeds.js';
import { logger } from '../logger.js';
import type { CommandContext } from '../types/command.js';

/**
 * Resolves a command from raw message text.
 * - With prefix: any command may be invoked.
 * - Without prefix: only commands flagged `noPrefix`, or any command when the
 *   guild has enabled no-prefix mode (`setnprefix`).
 */
async function resolveInvocation(content: string, prefix: string, noPrefixMode: boolean, guildId: string) {
  const trimmed = content.trim();
  if (!trimmed) return null;

  let body = trimmed;
  let prefixed = false;
  if (prefix && trimmed.startsWith(prefix)) {
    body = trimmed.slice(prefix.length).trim();
    prefixed = true;
  }

  const tokens = body.split(/\s+/);
  const name = tokens.shift()?.toLowerCase();
  if (!name) return null;

  let command = registry.get(name);
  if (!command) {
    command = await resolveAliasCommand(guildId, name);
  }
  if (!command) return null;

  if (!prefixed && !command.noPrefix && !noPrefixMode) return null;

  return { command, args: tokens, rest: body.slice(name.length).trim() };
}

export async function handleMessage(message: Message): Promise<void> {
  if (message.author.bot || !message.inGuild()) return;

  const cfg = await getGuildConfig(message.guildId);
  const resolved = await resolveInvocation(message.content, cfg.prefix, cfg.noPrefixMode, message.guildId);
  if (!resolved) return;

  const { command, args, rest } = resolved;
  const member = message.member;
  if (!member) return;

  const permission = await checkPermission(member, command);
  if (!permission.allowed) {
    await message.reply({ embeds: [errorEmbed(permission.reason ?? 'لا تملك صلاحية.')] }).catch(() => {});
    return;
  }

  const ctx: CommandContext = {
    client: message.client,
    message: message as Message<true>,
    guild: message.guild!,
    member,
    args,
    rest,
    config: cfg,
  };

  try {
    await command.execute(ctx);
  } catch (err) {
    logger.error({ err, command: command.name, guild: message.guildId }, 'Command failed');
    await message
      .reply({ embeds: [errorEmbed('حدث خطأ أثناء تنفيذ الأمر.')] })
      .catch(() => {});
  }
}
