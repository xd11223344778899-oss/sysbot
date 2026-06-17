import { ChannelType, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types/command.js';
import { successEmbed, errorEmbed, baseEmbed } from '../shared/embeds.js';
import { resolveMember } from '../shared/resolvers.js';
import { prisma } from '../database/prisma.js';
import { invalidateGuildConfig, getGuildConfig } from '../database/guild-config.js';
import { applyTextMuteOverwriteToChannel } from '../services/text-mute-overwrites.js';

const lock: Command = {
  name: 'lock',
  description: 'Lock the chat',
  category: 'channels',
  permission: 'mod',
  async execute({ message, guild }) {
    const channel = message.channel;
    if (!('permissionOverwrites' in channel)) return;
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
    await message.reply({ embeds: [successEmbed('تم قفل الشات.')] });
  },
};

const unlock: Command = {
  name: 'unlock',
  description: 'Un lock the chat',
  category: 'channels',
  permission: 'mod',
  async execute({ message, guild }) {
    const channel = message.channel;
    if (!('permissionOverwrites' in channel)) return;
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
    await message.reply({ embeds: [successEmbed('تم فتح الشات.')] });
  },
};

const hide: Command = {
  name: 'hide',
  description: 'Hide the chat',
  category: 'channels',
  permission: 'mod',
  async execute({ message, guild }) {
    const channel = message.channel;
    if (!('permissionOverwrites' in channel)) return;
    await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
    await message.reply({ embeds: [successEmbed('تم إخفاء الشات.')] });
  },
};

const unhide: Command = {
  name: 'unhide',
  description: 'Un hide the chat',
  category: 'channels',
  permission: 'mod',
  async execute({ message, guild }) {
    const channel = message.channel;
    if (!('permissionOverwrites' in channel)) return;
    await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: null });
    await message.reply({ embeds: [successEmbed('تم إظهار الشات.')] });
  },
};

const slowmode: Command = {
  name: 'slowmode',
  description: 'Applay slowmode in chat',
  category: 'channels',
  permission: 'mod',
  usage: '<seconds>',
  async execute({ message, args }) {
    const seconds = Math.min(Math.max(parseInt(args[0] ?? '0', 10) || 0, 0), 21600);
    const channel = message.channel;
    if (!('setRateLimitPerUser' in channel)) return;
    await channel.setRateLimitPerUser(seconds);
    await message.reply({ embeds: [successEmbed(`تم ضبط البطء على ${seconds} ثانية.`)] });
  },
};

const rooms: Command = {
  name: 'rooms',
  description: 'Get admins out of rooms',
  category: 'channels',
  permission: 'admin',
  async execute({ message, guild }) {
    await guild.members.fetch();
    let count = 0;
    for (const member of guild.members.cache.values()) {
      if (member.voice.channel && member.permissions.has(PermissionFlagsBits.Administrator) && !member.user.bot) {
        await member.voice.disconnect().catch(() => {});
        count += 1;
      }
    }
    await message.reply({ embeds: [successEmbed(`تم سحب ${count} مشرف من الرومات.`)] });
  },
};

const move: Command = {
  name: 'move',
  description: 'Move user to your channel',
  category: 'channels',
  permission: 'mod',
  usage: '<@user>',
  async execute({ message, guild, member, args }) {
    const target = await resolveMember(guild, args[0]);
    if (!member.voice.channel) {
      await message.reply({ embeds: [errorEmbed('يجب أن تكون في روم صوتي.')] });
      return;
    }
    if (!target?.voice.channel) {
      await message.reply({ embeds: [errorEmbed('العضو ليس في روم صوتي.')] });
      return;
    }
    await target.voice.setChannel(member.voice.channel);
    await message.reply({ embeds: [successEmbed(`تم نقل ${target} إليك.`)] });
  },
};

const moveme: Command = {
  name: 'moveme',
  description: 'move you to another channel',
  category: 'channels',
  permission: 'mod',
  usage: '<@user|channelId>',
  async execute({ message, guild, member, args }) {
    if (!member.voice.channel) {
      await message.reply({ embeds: [errorEmbed('يجب أن تكون في روم صوتي.')] });
      return;
    }
    const target = await resolveMember(guild, args[0]);
    const channel = target?.voice.channel ?? guild.channels.cache.get(args[0]?.replace(/\D/g, '') ?? '');
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      await message.reply({ embeds: [errorEmbed('حدد روم صوتي صحيح أو عضو في روم.')] });
      return;
    }
    await member.voice.setChannel(channel);
    await message.reply({ embeds: [successEmbed('تم نقلك.')] });
  },
};

function makeChannelAccessCommand(
  name: string,
  description: string,
  mode: 'ALLOW' | 'DENY',
): Command {
  return {
    name,
    description,
    category: 'channels',
    permission: 'mod',
    usage: '<@user>',
    async execute({ message, guild, member, args }) {
      const target = await resolveMember(guild, args[0]);
      const channel = member.voice.channel;
      if (!channel) {
        await message.reply({ embeds: [errorEmbed('يجب أن تكون في الروم الصوتي المطلوب.')] });
        return;
      }
      if (!target) {
        await message.reply({ embeds: [errorEmbed('حدد عضو صحيح.')] });
        return;
      }
      await channel.permissionOverwrites.edit(target.id, {
        Connect: mode === 'ALLOW' ? true : false,
      });
      await prisma.channelDeny.upsert({
        where: { guildId_channelId_userId: { guildId: guild.id, channelId: channel.id, userId: target.id } },
        update: { mode },
        create: { guildId: guild.id, channelId: channel.id, userId: target.id, mode },
      });
      await message.reply({
        embeds: [successEmbed(mode === 'ALLOW' ? `تم السماح لـ ${target} بالدخول.` : `تم منع ${target} من الدخول.`)],
      });
    },
  };
}

const callow = makeChannelAccessCommand('callow', 'Allow user to join a channel', 'ALLOW');
const cdeny = makeChannelAccessCommand('cdeny', 'Deny user to join a channel', 'DENY');

function makeChannelHideCommand(name: string, description: string, hide: boolean): Command {
  return {
    name,
    description,
    category: 'channels',
    permission: 'mod',
    usage: '<@user>',
    async execute({ message, guild, member, args }) {
      const target = await resolveMember(guild, args[0]);
      const channel = member.voice.channel;
      if (!channel || !target) {
        await message.reply({ embeds: [errorEmbed('كن في روم صوتي وحدد عضو.')] });
        return;
      }
      await channel.permissionOverwrites.edit(target.id, { ViewChannel: hide ? false : null });
      await message.reply({
        embeds: [successEmbed(hide ? `تم إخفاء الروم عن ${target}.` : `تم إظهار الروم لـ ${target}.`)],
      });
    },
  };
}

const chide = makeChannelHideCommand('chide', 'Hide voice channel on the member', true);
const cunhide = makeChannelHideCommand('cunhide', 'Unhide voice channel on the member', false);

const clist: Command = {
  name: 'clist',
  description: 'List deny users of channels',
  category: 'channels',
  permission: 'mod',
  async execute({ message, guild }) {
    const denies = await prisma.channelDeny.findMany({ where: { guildId: guild.id, mode: 'DENY' } });
    const lines = denies.map((d) => `<#${d.channelId}> — ممنوع: <@${d.userId}>`);
    await message.reply({
      embeds: [baseEmbed().setTitle('قائمة المنع من الرومات').setDescription(lines.join('\n') || 'لا يوجد')],
    });
  },
};

const blackchat: Command = {
  name: 'blackchat',
  description: 'Set blacklist chat',
  category: 'channels',
  permission: 'admin',
  usage: '<#channel> (أو الحالية)',
  async execute({ message, guild, args }) {
    const channelId = args[0]?.replace(/\D/g, '') || message.channelId;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    const existing = await prisma.blacklistChat.findUnique({
      where: { guildId_channelId: { guildId: guild.id, channelId } },
    });
    const cfg = await getGuildConfig(guild.id);
    if (existing) {
      await prisma.blacklistChat.delete({ where: { id: existing.id } });
      if (cfg.mutedRoleId && channel) {
        await applyTextMuteOverwriteToChannel(channel, cfg.mutedRoleId, false);
      }
      await message.reply({ embeds: [successEmbed(`تم إزالة <#${channelId}> من القنوات المستثناة.`)] });
    } else {
      await prisma.blacklistChat.create({ data: { guildId: guild.id, channelId } });
      if (cfg.mutedRoleId && channel) {
        await applyTextMuteOverwriteToChannel(channel, cfg.mutedRoleId, true);
      }
      await message.reply({ embeds: [successEmbed(`تم استثناء <#${channelId}> من إسكات الكتابة.`)] });
    }
    invalidateGuildConfig(guild.id);
  },
};

export const channelCommands: Command[] = [
  lock,
  unlock,
  hide,
  unhide,
  slowmode,
  rooms,
  move,
  moveme,
  callow,
  cdeny,
  chide,
  cunhide,
  clist,
  blackchat,
];
