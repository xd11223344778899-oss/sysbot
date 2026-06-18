import { ChannelType, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import type { Command } from '../types/command.js';
import { successEmbed, errorEmbed, infoEmbed, baseEmbed } from '../shared/embeds.js';
import { resolveMember, resolveRole } from '../shared/resolvers.js';
import { registry } from '../core/command-registry.js';

const ping: Command = {
  name: 'ping',
  description: 'Bot connection speed',
  category: 'utility',
  permission: 'everyone',
  async execute({ message, client }) {
    const sent = await message.reply({ embeds: [infoEmbed('جارٍ قياس زمن الاستجابة.')] });
    const latency = sent.createdTimestamp - message.createdTimestamp;
    await sent.edit({
      embeds: [
        baseEmbed()
          .setTitle('Pong')
          .addFields(
            { name: 'الاستجابة', value: `${latency}ms`, inline: true },
            { name: 'WebSocket', value: `${Math.round(client.ws.ping)}ms`, inline: true },
          ),
      ],
    });
  },
};

const help: Command = {
  name: 'help',
  description: 'Bot help — lists command categories',
  category: 'utility',
  permission: 'everyone',
  async execute({ message, config }) {
    await message.reply({
      embeds: [
        baseEmbed()
          .setTitle('مساعدة SysBot')
          .setDescription(
            [
              `البرفكس: \`${config.prefix}\``,
              `استخدم \`${config.prefix}commands\` لعرض جميع الأوامر.`,
              `استخدم \`${config.prefix}vip\` لإعدادات الإدارة (للمالك/قائمة السماح).`,
            ].join('\n'),
          ),
      ],
    });
  },
};

const commands: Command = {
  name: 'commands',
  description: 'Show commands list',
  category: 'utility',
  permission: 'everyone',
  async execute({ message, config }) {
    const grouped = registry.byCategory();
    const embed = baseEmbed().setTitle('قائمة الأوامر').setFooter({ text: `البرفكس: ${config.prefix}` });
    for (const [category, cmds] of grouped) {
      const lines = cmds.map((c) => `\`${c.name}\` — ${c.description}`).join('\n');
      embed.addFields({ name: category.toUpperCase(), value: lines.slice(0, 1024) });
    }
    await message.reply({ embeds: [embed] });
  },
};

const user: Command = {
  name: 'user',
  description: 'Get user info',
  category: 'utility',
  permission: 'everyone',
  usage: '[@user]',
  async execute({ message, guild, member, args }) {
    const target = (await resolveMember(guild, args[0])) ?? member;
    const embed = baseEmbed()
      .setTitle(target.user.tag)
      .setThumbnail(target.user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: 'المعرف', value: target.id, inline: true },
        { name: 'إنشاء الحساب', value: `<t:${Math.floor(target.user.createdTimestamp / 1000)}:R>`, inline: true },
        {
          name: 'الانضمام',
          value: target.joinedTimestamp ? `<t:${Math.floor(target.joinedTimestamp / 1000)}:R>` : 'غير معروف',
          inline: true,
        },
        { name: 'الرولات', value: `${target.roles.cache.size - 1}`, inline: true },
      );
    await message.reply({ embeds: [embed] });
  },
};

const avatar: Command = {
  name: 'avatar',
  description: 'Get user avatar',
  category: 'utility',
  permission: 'everyone',
  usage: '[@user]',
  async execute({ message, guild, member, args }) {
    const target = (await resolveMember(guild, args[0])) ?? member;
    await message.reply({
      embeds: [baseEmbed().setTitle(`أفاتار ${target.user.username}`).setImage(target.user.displayAvatarURL({ size: 1024 }))],
    });
  },
};

const banner: Command = {
  name: 'banner',
  description: 'Get user banner',
  category: 'utility',
  permission: 'everyone',
  usage: '[@user]',
  async execute({ message, guild, member, args, client }) {
    const target = (await resolveMember(guild, args[0])) ?? member;
    const fetched = await client.users.fetch(target.id, { force: true });
    const url = fetched.bannerURL({ size: 1024 });
    if (!url) {
      await message.reply({ embeds: [errorEmbed('لا يوجد بنر لهذا العضو.')] });
      return;
    }
    await message.reply({ embeds: [baseEmbed().setTitle(`بنر ${target.user.username}`).setImage(url)] });
  },
};

const server: Command = {
  name: 'server',
  description: 'Server info',
  category: 'utility',
  permission: 'everyone',
  async execute({ message, guild }) {
    const embed = baseEmbed()
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: 'الأعضاء', value: `${guild.memberCount}`, inline: true },
        { name: 'القنوات', value: `${guild.channels.cache.size}`, inline: true },
        { name: 'الرولات', value: `${guild.roles.cache.size}`, inline: true },
        { name: 'الإنشاء', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'المالك', value: `<@${guild.ownerId}>`, inline: true },
        { name: 'البوست', value: `${guild.premiumSubscriptionCount ?? 0}`, inline: true },
      );
    await message.reply({ embeds: [embed] });
  },
};

const adminlist: Command = {
  name: 'adminlist',
  description: 'Get all admins in server',
  category: 'utility',
  permission: 'mod',
  async execute({ message, guild }) {
    await guild.members.fetch();
    const admins = guild.members.cache.filter(
      (m) => !m.user.bot && m.permissions.has(PermissionFlagsBits.Administrator),
    );
    const list = admins.map((m) => `${m} (${m.user.tag})`).join('\n') || 'لا يوجد';
    await message.reply({ embeds: [baseEmbed().setTitle('المشرفون').setDescription(list.slice(0, 4000))] });
  },
};

const check: Command = {
  name: 'check',
  description: 'Get role members',
  category: 'utility',
  permission: 'mod',
  usage: '<@role>',
  async execute({ message, guild, args }) {
    const role = resolveRole(guild, args[0]);
    if (!role) {
      await message.reply({ embeds: [errorEmbed('حدد رول صحيح.')] });
      return;
    }
    await guild.members.fetch();
    const list = role.members.map((m) => `${m}`).join(', ') || 'لا أحد';
    await message.reply({
      embeds: [baseEmbed().setTitle(`أعضاء ${role.name} (${role.members.size})`).setDescription(list.slice(0, 4000))],
    });
  },
};

const checkvc: Command = {
  name: 'checkvc',
  description: 'Get role members and voice status',
  category: 'utility',
  permission: 'mod',
  usage: '<@role>',
  async execute({ message, guild, args }) {
    const role = resolveRole(guild, args[0]);
    if (!role) {
      await message.reply({ embeds: [errorEmbed('حدد رول صحيح.')] });
      return;
    }
    await guild.members.fetch();
    const lines = role.members.map((m) => {
      const vc = m.voice.channel ? `في الصوت: ${m.voice.channel.name}` : 'خارج الصوت';
      return `${m} — ${vc}`;
    });
    await message.reply({
      embeds: [baseEmbed().setTitle(`${role.name} — الحالة الصوتية`).setDescription(lines.join('\n').slice(0, 4000) || 'لا أحد')],
    });
  },
};

const say: Command = {
  name: 'say',
  description: 'Send message',
  category: 'utility',
  permission: 'mod',
  usage: '<text>',
  async execute({ message, rest }) {
    if (!rest) return;
    await message.delete().catch(() => {});
    if (message.channel.isTextBased() && 'send' in message.channel) {
      await message.channel.send(rest);
    }
  },
};

const dm: Command = {
  name: 'dm',
  description: 'Send message to member in dm',
  category: 'utility',
  permission: 'mod',
  usage: '<@user> <text>',
  async execute({ message, guild, args, rest }) {
    const target = await resolveMember(guild, args[0]);
    if (!target) {
      await message.reply({ embeds: [errorEmbed('حدد عضو صحيح.')] });
      return;
    }
    const text = rest.slice(args[0].length).trim();
    if (!text) {
      await message.reply({ embeds: [errorEmbed('اكتب الرسالة.')] });
      return;
    }
    await target.send(text).then(
      () => message.reply({ embeds: [successEmbed('تم الإرسال.')] }),
      () => message.reply({ embeds: [errorEmbed('تعذّر إرسال رسالة خاصة.')] }),
    );
  },
};

const addemoji: Command = {
  name: 'addemoji',
  description: 'Add emoji to server',
  category: 'utility',
  permission: 'admin',
  usage: '<name> (مع صورة مرفقة أو رابط)',
  async execute({ message, guild, args }) {
    const attachment = message.attachments.first();
    const url = attachment?.url ?? args[1];
    const name = args[0];
    if (!url || !name) {
      await message.reply({ embeds: [errorEmbed('استخدم: addemoji <الاسم> مع إرفاق صورة.')] });
      return;
    }
    try {
      const emoji = await guild.emojis.create({ attachment: url, name });
      await message.reply({ embeds: [successEmbed(`تمت إضافة ${emoji}.`)] });
    } catch {
      await message.reply({ embeds: [errorEmbed('فشلت إضافة الإيموجي.')] });
    }
  },
};

const sticker: Command = {
  name: 'sticker',
  description: 'Add sticker to server',
  category: 'utility',
  permission: 'admin',
  usage: '<name> (مع ملصق أو صورة مرفقة)',
  async execute({ message, guild, args }) {
    const file = message.attachments.first();
    if (!file) {
      await message.reply({ embeds: [errorEmbed('أرفق صورة الملصق.')] });
      return;
    }
    try {
      await guild.stickers.create({
        file: file.url,
        name: args[0] ?? 'sticker',
        tags: 'sysbot',
      });
      await message.reply({ embeds: [successEmbed('تمت إضافة الملصق.')] });
    } catch {
      await message.reply({ embeds: [errorEmbed('فشلت إضافة الملصق.')] });
    }
  },
};

export const utilityCommands: Command[] = [
  ping,
  help,
  commands,
  user,
  avatar,
  banner,
  server,
  adminlist,
  check,
  checkvc,
  say,
  dm,
  addemoji,
  sticker,
];
