import {
  ChannelType,
  PermissionFlagsBits,
  type CategoryChannel,
  type Guild,
  type GuildBasedChannel,
} from 'discord.js';
import { CATEGORY_NAMES, RESTRICTED_CHANNELS } from '../shared/constants.js';
import { logger } from '../logger.js';

export interface RestrictedChannelIds {
  restrictedCategoryId: string;
  blackChannelId: string;
  blackVoiceId: string;
  prisonChannelId: string;
  prisonVoiceId: string;
}

async function ensureCategory(guild: Guild, name: string): Promise<CategoryChannel> {
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === name,
  );
  if (existing) return existing as CategoryChannel;
  return guild.channels.create({ name, type: ChannelType.GuildCategory });
}

async function ensureRestrictedChannel(
  guild: Guild,
  parent: CategoryChannel,
  name: string,
  type: ChannelType.GuildText | ChannelType.GuildVoice,
  roleId: string,
): Promise<string> {
  let channel = guild.channels.cache.find(
    (c) => c.parentId === parent.id && c.name === name && c.type === type,
  );
  if (!channel) {
    channel = await guild.channels.create({
      name,
      type,
      parent: parent.id,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: roleId,
          allow:
            type === ChannelType.GuildVoice
              ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
              : [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.ReadMessageHistory,
                ],
        },
      ],
    });
  } else if ('permissionOverwrites' in channel) {
    await channel.permissionOverwrites
      .edit(guild.roles.everyone.id, { ViewChannel: false })
      .catch(() => {});
    await channel.permissionOverwrites
      .edit(roleId, {
        ViewChannel: true,
        SendMessages: type === ChannelType.GuildText ? true : undefined,
        ReadMessageHistory: type === ChannelType.GuildText ? true : undefined,
        Connect: type === ChannelType.GuildVoice ? true : undefined,
        Speak: type === ChannelType.GuildVoice ? true : undefined,
      })
      .catch(() => {});
  }
  return channel.id;
}

export async function ensureRestrictedSetup(
  guild: Guild,
  blacklistedRoleId: string,
  prisonRoleId: string,
): Promise<RestrictedChannelIds> {
  await guild.channels.fetch().catch(() => {});
  const category = await ensureCategory(guild, CATEGORY_NAMES.restricted);

  const blackChannelId = await ensureRestrictedChannel(
    guild,
    category,
    RESTRICTED_CHANNELS.blackText,
    ChannelType.GuildText,
    blacklistedRoleId,
  );
  const blackVoiceId = await ensureRestrictedChannel(
    guild,
    category,
    RESTRICTED_CHANNELS.blackVoice,
    ChannelType.GuildVoice,
    blacklistedRoleId,
  );
  const prisonChannelId = await ensureRestrictedChannel(
    guild,
    category,
    RESTRICTED_CHANNELS.prisonText,
    ChannelType.GuildText,
    prisonRoleId,
  );
  const prisonVoiceId = await ensureRestrictedChannel(
    guild,
    category,
    RESTRICTED_CHANNELS.prisonVoice,
    ChannelType.GuildVoice,
    prisonRoleId,
  );

  logger.info({ guild: guild.id }, 'Restricted channels ensured');
  return {
    restrictedCategoryId: category.id,
    blackChannelId,
    blackVoiceId,
    prisonChannelId,
    prisonVoiceId,
  };
}

export function isRestrictedChannel(channel: GuildBasedChannel, ids: RestrictedChannelIds): boolean {
  return (
    channel.id === ids.blackChannelId ||
    channel.id === ids.blackVoiceId ||
    channel.id === ids.prisonChannelId ||
    channel.id === ids.prisonVoiceId ||
    channel.parentId === ids.restrictedCategoryId
  );
}
