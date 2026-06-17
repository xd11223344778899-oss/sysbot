import { ActivityType, type PresenceStatusData } from 'discord.js';
import type { Command } from '../types/command.js';
import { successEmbed, errorEmbed, baseEmbed, statusOnOff } from '../shared/embeds.js';
import { resolveMember } from '../shared/resolvers.js';
import { prisma } from '../database/prisma.js';
import { updateGuildConfig } from '../database/guild-config.js';
import { config as env } from '../config.js';
import { logger } from '../logger.js';

const setname: Command = {
  name: 'setname',
  description: 'Change bot name',
  category: 'customization',
  permission: 'owner',
  usage: '<name>',
  async execute({ message, client, rest }) {
    if (!rest) {
      await message.reply({ embeds: [errorEmbed('اكتب الاسم الجديد.')] });
      return;
    }
    await client.user!.setUsername(rest).then(
      () => message.reply({ embeds: [successEmbed('تم تغيير اسم البوت.')] }),
      () => message.reply({ embeds: [errorEmbed('تعذّر تغيير الاسم (قد يكون بسبب حد التغيير).')] }),
    );
  },
};

const setavatar: Command = {
  name: 'setavatar',
  description: 'Change bot avatar',
  category: 'customization',
  permission: 'owner',
  usage: '<url> (أو صورة مرفقة)',
  async execute({ message, client, args }) {
    const url = message.attachments.first()?.url ?? args[0];
    if (!url) {
      await message.reply({ embeds: [errorEmbed('أرفق صورة أو ضع رابط.')] });
      return;
    }
    await client.user!.setAvatar(url).then(
      () => message.reply({ embeds: [successEmbed('تم تغيير أفاتار البوت.')] }),
      () => message.reply({ embeds: [errorEmbed('تعذّر تغيير الأفاتار.')] }),
    );
  },
};

const setbanner: Command = {
  name: 'setbanner',
  description: 'Change bot banner',
  category: 'customization',
  permission: 'owner',
  usage: '<url> (أو صورة مرفقة)',
  async execute({ message, client, args }) {
    const url = message.attachments.first()?.url ?? args[0];
    if (!url) {
      await message.reply({ embeds: [errorEmbed('أرفق صورة أو ضع رابط.')] });
      return;
    }
    await client.user!.setBanner(url).then(
      () => message.reply({ embeds: [successEmbed('تم تغيير بنر البوت.')] }),
      () => message.reply({ embeds: [errorEmbed('تعذّر تغيير البنر (يحتاج البوت بوست/نيترو).')] }),
    );
  },
};

const setowner: Command = {
  name: 'setowner',
  description: 'Add or remove owner to bot',
  category: 'customization',
  permission: 'owner',
  usage: '<@user>',
  async execute({ message, guild, args }) {
    const target = await resolveMember(guild, args[0]);
    if (!target) {
      await message.reply({ embeds: [errorEmbed('حدد عضو صحيح.')] });
      return;
    }
    if (env.globalOwners.includes(target.id)) {
      await message.reply({ embeds: [errorEmbed('هذا مالك أساسي ولا يمكن تعديله.')] });
      return;
    }
    const existing = await prisma.botOwner.findUnique({
      where: { guildId_userId: { guildId: guild.id, userId: target.id } },
    });
    if (existing) {
      await prisma.botOwner.delete({ where: { id: existing.id } });
      await message.reply({ embeds: [successEmbed(`تم إزالة ${target} من الأونرات.`)] });
    } else {
      await prisma.botOwner.create({ data: { guildId: guild.id, userId: target.id } });
      await message.reply({ embeds: [successEmbed(`تمت إضافة ${target} كأونر.`)] });
    }
  },
};

const owners: Command = {
  name: 'owners',
  description: 'Show owners list',
  category: 'customization',
  permission: 'mod',
  async execute({ message, guild }) {
    const guildOwners = await prisma.botOwner.findMany({ where: { guildId: guild.id } });
    const lines = [
      ...env.globalOwners.map((id) => `<@${id}> (أساسي)`),
      ...guildOwners.map((o) => `<@${o.userId}>`),
    ];
    await message.reply({
      embeds: [baseEmbed().setTitle('أونرات البوت').setDescription(lines.join('\n') || 'لا يوجد')],
    });
  },
};

const setprefix: Command = {
  name: 'setprefix',
  description: 'Change command prefix',
  category: 'customization',
  permission: 'owner',
  usage: '<prefix>',
  async execute({ message, guild, args }) {
    const prefix = args[0];
    if (!prefix || prefix.length > 5) {
      await message.reply({ embeds: [errorEmbed('حدد برفكس صحيح (حتى 5 أحرف).')] });
      return;
    }
    await updateGuildConfig(guild.id, { prefix });
    await message.reply({ embeds: [successEmbed(`تم تغيير البرفكس إلى \`${prefix}\`.`)] });
  },
};

const setnprefix: Command = {
  name: 'setnprefix',
  description: 'Use mods command without prefix',
  category: 'customization',
  permission: 'owner',
  async execute({ message, guild, config }) {
    await updateGuildConfig(guild.id, { noPrefixMode: !config.noPrefixMode });
    await message.reply({
      embeds: [
        successEmbed(
          `وضع بدون برفكس: ${statusOnOff(!config.noPrefixMode)}${!config.noPrefixMode ? ' (الأوامر تعمل بالاسم فقط)' : ''}`,
        ),
      ],
    });
  },
};

const ACTIVITY_TYPES: Record<string, ActivityType> = {
  playing: ActivityType.Playing,
  listening: ActivityType.Listening,
  watching: ActivityType.Watching,
  streaming: ActivityType.Streaming,
  competing: ActivityType.Competing,
};

const setactivity: Command = {
  name: 'setactivity',
  aliases: ['play'],
  description: 'Change bot activity (playing/listening/watching/streaming)',
  category: 'customization',
  permission: 'owner',
  usage: '<playing|listening|watching|streaming> <text>',
  async execute({ message, client, args, rest }) {
    const typeKey = args[0]?.toLowerCase();
    const type = typeKey ? ACTIVITY_TYPES[typeKey] : undefined;
    const text = rest.slice(args[0]?.length ?? 0).trim();
    if (type === undefined || !text) {
      await message.reply({ embeds: [errorEmbed('استخدم: setactivity <playing|listening|watching|streaming> <النص>.')] });
      return;
    }
    client.user!.setActivity(text, {
      type,
      url: type === ActivityType.Streaming ? 'https://twitch.tv/sysbot' : undefined,
    });
    await message.reply({ embeds: [successEmbed('تم تغيير لعب البوت.')] });
  },
};

const setstatus: Command = {
  name: 'setstatus',
  description: 'Change bot status (online/idle/dnd/invisible)',
  category: 'customization',
  permission: 'owner',
  usage: '<online|idle|dnd|invisible>',
  async execute({ message, client, args }) {
    const status = args[0]?.toLowerCase() as PresenceStatusData;
    if (!['online', 'idle', 'dnd', 'invisible'].includes(status)) {
      await message.reply({ embeds: [errorEmbed('اختر: online | idle | dnd | invisible.')] });
      return;
    }
    client.user!.setStatus(status);
    await message.reply({ embeds: [successEmbed(`تم تغيير حالة البوت إلى ${status}.`)] });
  },
};

const restart: Command = {
  name: 'restart',
  description: 'Restart the bot',
  category: 'customization',
  permission: 'owner',
  async execute({ message }) {
    await message.reply({ embeds: [successEmbed('جارٍ إعادة تشغيل البوت.')] });
    logger.info({ by: message.author.id }, 'Restart requested');
    setTimeout(() => process.exit(0), 1000);
  },
};

export const customizationCommands: Command[] = [
  setname,
  setavatar,
  setbanner,
  setowner,
  owners,
  setprefix,
  setnprefix,
  setactivity,
  setstatus,
  restart,
];
