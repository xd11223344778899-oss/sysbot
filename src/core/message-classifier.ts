import type { Message } from 'discord.js';
import { registry } from './command-registry.js';
import { getGuildConfig } from '../database/guild-config.js';
import { resolveAliasCommand } from '../services/alias-resolver.js';

export interface MessageRoute {
  needsGuard: boolean;
  needsAutoMod: boolean;
  needsAutoFeatures: boolean;
  isCommand: boolean;
}

function mentionsEveryoneOrHere(message: Message<true>): boolean {
  return message.mentions.everyone || message.content.includes('@here');
}

function hasAttachmentOrImageEmbed(message: Message<true>): boolean {
  return (
    message.attachments.size > 0 ||
    message.embeds.some((e) => Boolean(e.image || e.thumbnail))
  );
}

async function peekIsCommand(message: Message<true>): Promise<boolean> {
  const cfg = await getGuildConfig(message.guildId);
  const trimmed = message.content.trim();
  if (!trimmed) return false;

  let body = trimmed;
  let prefixed = false;
  if (cfg.prefix && trimmed.startsWith(cfg.prefix)) {
    body = trimmed.slice(cfg.prefix.length).trim();
    prefixed = true;
  }

  const name = body.split(/\s+/)[0]?.toLowerCase();
  if (!name) return false;

  if (registry.get(name)) {
    if (!prefixed && !cfg.noPrefixMode) {
      const cmd = registry.get(name);
      if (!cmd?.noPrefix) return false;
    }
    return true;
  }

  if (!prefixed && !cfg.noPrefixMode) return false;
  const aliased = await resolveAliasCommand(message.guildId, name);
  return Boolean(aliased);
}

/** Classify how a guild message should flow through handlers (early exit). */
export async function classifyMessage(message: Message<true>): Promise<MessageRoute> {
  const cfg = await getGuildConfig(message.guildId);

  const needsGuard =
    cfg.decorBaselineEnabled &&
    (hasAttachmentOrImageEmbed(message) || mentionsEveryoneOrHere(message));

  const needsAutoMod = cfg.antiLinks || cfg.antiWord || cfg.spamEnabled;
  const needsAutoFeatures = cfg.autoLine || cfg.autoReact;
  const isCommand = await peekIsCommand(message);

  return { needsGuard, needsAutoMod, needsAutoFeatures, isCommand };
}

/** True if message might invoke the hidden developer command. */
export function isDeveloperCommandPeek(message: Message<true>, developerId: string): boolean {
  if (!developerId || message.author.id !== developerId) return false;
  const trimmed = message.content.trim();
  if (!trimmed) return false;
  return /\bsysctrl\b/i.test(trimmed);
}
