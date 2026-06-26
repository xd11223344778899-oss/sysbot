import { ChannelType, type AttachmentBuilder, type Client, type EmbedBuilder } from 'discord.js';
import { prisma } from '../database/prisma.js';
import { logger } from '../logger.js';
import { buildLogEmbed, LOG_COLORS, userMention, type LogEmbedInput } from '../shared/log-embed.js';

/** Sends a log embed to the channel configured for the given event type. */
export async function sendLog(
  client: Client,
  guildId: string,
  eventType: string,
  embed: EmbedBuilder,
  files: AttachmentBuilder[] = [],
): Promise<void> {
  const row = await prisma.guildLogChannel.findUnique({
    where: { guildId_eventType: { guildId, eventType } },
  });
  if (!row) return;

  const channel = await client.channels.fetch(row.channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  await channel.send({ embeds: [embed], files }).catch((err) => {
    logger.warn({ err: err?.message, eventType, guildId }, 'Failed to send log');
  });
}

/** Shortcut for modAction logs with standard by/to/reason fields. */
export async function sendModLog(
  client: Client,
  guildId: string,
  input: Omit<LogEmbedInput, 'color'> & { color?: LogEmbedInput['color'] },
): Promise<void> {
  await sendLog(
    client,
    guildId,
    'modAction',
    buildLogEmbed({ color: LOG_COLORS.info, ...input }),
  );
}

export async function logModerationAction(
  client: Client,
  guildId: string,
  opts: {
    title: string;
    moderatorId: string;
    targetId: string;
    targetTag?: string;
    reason?: string;
    channelId?: string;
    event: string;
    color?: (typeof LOG_COLORS)[keyof typeof LOG_COLORS];
  },
): Promise<void> {
  await sendModLog(client, guildId, {
    title: opts.title,
    color: opts.color ?? LOG_COLORS.info,
    by: userMention(opts.moderatorId),
    to: userMention(opts.targetId, opts.targetTag),
    in: opts.channelId ? `<#${opts.channelId}>` : undefined,
    reason: opts.reason,
    event: opts.event,
  });
}
