import type { Command } from '../types/command.js';
import { successEmbed, errorEmbed, baseEmbed } from '../shared/embeds.js';
import { resolveMember } from '../shared/resolvers.js';
import { prisma } from '../database/prisma.js';
import { updateGuildConfig } from '../database/guild-config.js';

const info: Command = {
  name: 'info',
  description: 'User points',
  category: 'points',
  permission: 'everyone',
  usage: '[@user]',
  async execute({ message, guild, member, args }) {
    const target = (await resolveMember(guild, args[0])) ?? member;
    const point = await prisma.point.findUnique({
      where: { guildId_userId: { guildId: guild.id, userId: target.id } },
    });
    await message.reply({
      embeds: [baseEmbed().setTitle(`نقاط ${target.user.username}`).setDescription(`${point?.amount ?? 0} نقطة`)],
    });
  },
};

const apoint: Command = {
  name: 'apoint',
  description: 'Add point',
  category: 'points',
  permission: 'mod',
  usage: '<@user> <amount>',
  async execute({ message, guild, args }) {
    const target = await resolveMember(guild, args[0]);
    const amount = parseInt(args[1] ?? '1', 10) || 1;
    if (!target) {
      await message.reply({ embeds: [errorEmbed('حدد عضو صحيح.')] });
      return;
    }
    const point = await prisma.point.upsert({
      where: { guildId_userId: { guildId: guild.id, userId: target.id } },
      update: { amount: { increment: amount } },
      create: { guildId: guild.id, userId: target.id, amount },
    });
    await message.reply({ embeds: [successEmbed(`نقاط ${target} الآن: ${point.amount}.`)] });
  },
};

const rpoint: Command = {
  name: 'rpoint',
  description: 'Remove point',
  category: 'points',
  permission: 'mod',
  usage: '<@user> <amount>',
  async execute({ message, guild, args }) {
    const target = await resolveMember(guild, args[0]);
    const amount = parseInt(args[1] ?? '1', 10) || 1;
    if (!target) {
      await message.reply({ embeds: [errorEmbed('حدد عضو صحيح.')] });
      return;
    }
    const point = await prisma.point.upsert({
      where: { guildId_userId: { guildId: guild.id, userId: target.id } },
      update: {},
      create: { guildId: guild.id, userId: target.id, amount: 0 },
    });
    const next = Math.max(0, point.amount - amount);
    await prisma.point.update({
      where: { guildId_userId: { guildId: guild.id, userId: target.id } },
      data: { amount: next },
    });
    await message.reply({ embeds: [successEmbed(`نقاط ${target} الآن: ${next}.`)] });
  },
};

const preset: Command = {
  name: 'preset',
  aliases: ['reset'],
  description: 'Reset point',
  category: 'points',
  permission: 'admin',
  usage: '[@user]',
  async execute({ message, guild, args }) {
    const target = await resolveMember(guild, args[0]);
    if (target) {
      await prisma.point.deleteMany({ where: { guildId: guild.id, userId: target.id } });
      await message.reply({ embeds: [successEmbed(`تم تصفير نقاط ${target}.`)] });
    } else {
      await prisma.point.deleteMany({ where: { guildId: guild.id } });
      await message.reply({ embeds: [successEmbed('تم تصفير جميع النقاط.')] });
    }
  },
};

const points: Command = {
  name: 'points',
  description: 'Top 10 members by points',
  category: 'points',
  permission: 'everyone',
  async execute({ message, guild }) {
    const top = await prisma.point.findMany({
      where: { guildId: guild.id },
      orderBy: { amount: 'desc' },
      take: 10,
    });
    const lines = top.map((p, i) => `${i + 1}. <@${p.userId}> — ${p.amount}`);
    await message.reply({
      embeds: [baseEmbed().setTitle('لوحة النقاط').setDescription(lines.join('\n') || 'لا يوجد')],
    });
  },
};

const myinv: Command = {
  name: 'myinv',
  description: 'Your invites',
  category: 'points',
  permission: 'everyone',
  async execute({ message, guild, member }) {
    const invites = await guild.invites.fetch().catch(() => null);
    const total = invites?.filter((i) => i.inviter?.id === member.id).reduce((sum, i) => sum + (i.uses ?? 0), 0) ?? 0;
    await message.reply({ embeds: [baseEmbed().setTitle('دعواتك').setDescription(`${total} دعوة`)] });
  },
};

const topinvite: Command = {
  name: 'topinvite',
  description: 'Top server invites',
  category: 'points',
  permission: 'everyone',
  async execute({ message, guild }) {
    const invites = await guild.invites.fetch().catch(() => null);
    if (!invites) {
      await message.reply({ embeds: [errorEmbed('تعذّر جلب الدعوات.')] });
      return;
    }
    const totals = new Map<string, number>();
    for (const inv of invites.values()) {
      if (!inv.inviter) continue;
      totals.set(inv.inviter.id, (totals.get(inv.inviter.id) ?? 0) + (inv.uses ?? 0));
    }
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const lines = sorted.map(([id, uses], i) => `${i + 1}. <@${id}> — ${uses}`);
    await message.reply({
      embeds: [baseEmbed().setTitle('أعلى الدعوات').setDescription(lines.join('\n') || 'لا يوجد')],
    });
  },
};

const link: Command = {
  name: 'link',
  description: 'Get server link',
  category: 'points',
  permission: 'everyone',
  async execute({ message, guild, config }) {
    if (config.linkInfo) {
      await message.reply({ embeds: [baseEmbed().setTitle('رابط السيرفر').setDescription(config.linkInfo)] });
      return;
    }
    const channel = guild.channels.cache.find((c) => c.isTextBased());
    const invite = channel ? await guild.invites.create(channel.id, { maxAge: 0 }).catch(() => null) : null;
    await message.reply({
      embeds: [baseEmbed().setTitle('رابط السيرفر').setDescription(invite ? invite.url : 'تعذّر إنشاء رابط.')],
    });
  },
};

const setlink: Command = {
  name: 'setlink',
  description: 'Set link info',
  category: 'points',
  permission: 'admin',
  usage: '<text>',
  async execute({ message, guild, rest }) {
    await updateGuildConfig(guild.id, { linkInfo: rest || null });
    await message.reply({ embeds: [successEmbed('تم تحديث معلومات الرابط.')] });
  },
};

export const pointsCommands: Command[] = [
  info,
  apoint,
  rpoint,
  preset,
  points,
  myinv,
  topinvite,
  link,
  setlink,
];
