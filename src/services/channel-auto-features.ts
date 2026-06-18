import type { Message } from 'discord.js';
import { prisma } from '../database/prisma.js';
import { resolveChannel } from '../shared/resolvers.js';

export interface CommandChannelTarget {
  channelId: string;
  restArgs: string[];
}

/** Command channel: mention, #channel/id arg, or the channel the command was sent in. */
export function resolveCommandChannel(message: Message<true>, args: string[]): CommandChannelTarget {
  const guild = message.guild;
  const mentioned = message.mentions.channels.first();
  if (mentioned) {
    const restArgs = args.filter((a) => !a.includes(mentioned.id));
    return { channelId: mentioned.id, restArgs };
  }

  const fromArg = resolveChannel(guild, args[0]);
  if (fromArg?.isTextBased()) {
    return { channelId: fromArg.id, restArgs: args.slice(1) };
  }

  return { channelId: message.channelId, restArgs: args };
}

export async function getChannelAutoFeature(guildId: string, channelId: string) {
  return prisma.channelAutoFeature.findUnique({
    where: { guildId_channelId: { guildId, channelId } },
  });
}

export async function channelHasAutoFeatures(guildId: string, channelId: string): Promise<boolean> {
  const row = await getChannelAutoFeature(guildId, channelId);
  if (!row) return false;
  return row.autoLine || (row.autoReact && Boolean(row.reactEmoji));
}

async function pruneIfEmpty(guildId: string, channelId: string): Promise<void> {
  const row = await getChannelAutoFeature(guildId, channelId);
  if (!row) return;
  if (!row.autoLine && !row.autoReact) {
    await prisma.channelAutoFeature.delete({
      where: { guildId_channelId: { guildId, channelId } },
    });
  }
}

export async function setChannelAutoLine(
  guildId: string,
  channelId: string,
  enabled: boolean,
): Promise<void> {
  if (!enabled) {
    const row = await getChannelAutoFeature(guildId, channelId);
    if (!row) return;
    await prisma.channelAutoFeature.update({
      where: { guildId_channelId: { guildId, channelId } },
      data: { autoLine: false },
    });
    await pruneIfEmpty(guildId, channelId);
    return;
  }

  await prisma.channelAutoFeature.upsert({
    where: { guildId_channelId: { guildId, channelId } },
    create: { guildId, channelId, autoLine: true },
    update: { autoLine: true },
  });
}

export async function setChannelAutoReact(
  guildId: string,
  channelId: string,
  enabled: boolean,
  reactEmoji?: string,
): Promise<void> {
  if (!enabled) {
    const row = await getChannelAutoFeature(guildId, channelId);
    if (!row) return;
    await prisma.channelAutoFeature.update({
      where: { guildId_channelId: { guildId, channelId } },
      data: { autoReact: false, reactEmoji: null },
    });
    await pruneIfEmpty(guildId, channelId);
    return;
  }

  await prisma.channelAutoFeature.upsert({
    where: { guildId_channelId: { guildId, channelId } },
    create: {
      guildId,
      channelId,
      autoReact: true,
      reactEmoji: reactEmoji ?? null,
    },
    update: {
      autoReact: true,
      ...(reactEmoji ? { reactEmoji } : {}),
    },
  });
}
