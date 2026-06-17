import type { Command } from '../types/command.js';
import { successEmbed, errorEmbed, baseEmbed, infoEmbed } from '../shared/embeds.js';
import {
  setupLogs,
  runSetupSync,
  formatSetupSyncReport,
} from '../services/setup-service.js';
import { prisma } from '../database/prisma.js';
import { updateGuildConfig } from '../database/guild-config.js';
import { LOG_EVENTS } from '../shared/constants.js';

const lsetup: Command = {
  name: 'lsetup',
  description: 'Create all logs / sync setup',
  category: 'logging',
  permission: 'admin',
  usage: 'sync | [compact|detailed]',
  async execute({ message, guild, args }) {
    const mode = args[0]?.toLowerCase();

    if (mode === 'sync') {
      const status = await message.reply({
        embeds: [infoEmbed('جارٍ التحقق من الإعداد وإصلاح النواقص وصلاحيات رول Muted. يرجى الانتظار.')],
      });
      try {
        const result = await runSetupSync(guild);
        await status.edit({ embeds: [successEmbed(formatSetupSyncReport(result))] });
      } catch {
        await status.edit({
          embeds: [errorEmbed('فشل المزامنة. تأكد أن البوت يملك صلاحية الإدارة.')],
        });
      }
      return;
    }

    if (mode === 'compact' || mode === 'detailed') {
      await updateGuildConfig(guild.id, { logMode: mode === 'compact' ? 'COMPACT' : 'DETAILED' });
    }
    const status = await message.reply({
      embeds: [
        infoEmbed(
          'جارٍ إنشاء اللوقات وتنفيذ الإعداد الأولي الكامل. لإعادة التحقق دون تكرار اللوقات استخدم `lsetup sync`.',
        ),
      ],
    });
    try {
      const created = await setupLogs(guild);
      await status.edit({ embeds: [successEmbed(`تم الإعداد. عدد قنوات اللوق الجديدة: ${created}.`)] });
    } catch {
      await status.edit({ embeds: [errorEmbed('فشل الإعداد. تأكد أن البوت يملك صلاحية الإدارة.')] });
    }
  },
};

const logs: Command = {
  name: 'logs',
  description: 'Set logs channels',
  category: 'logging',
  permission: 'admin',
  usage: '<eventType> <#channel>',
  async execute({ message, guild, args }) {
    if (!args[0]) {
      await message.reply({
        embeds: [
          baseEmbed()
            .setTitle('أنواع اللوقات')
            .setDescription(LOG_EVENTS.map((e) => `\`${e.type}\` — ${e.label}`).join('\n').slice(0, 4000)),
        ],
      });
      return;
    }
    const eventType = args[0];
    const channelId = args[1]?.replace(/\D/g, '') || message.channelId;
    if (!LOG_EVENTS.some((e) => e.type === eventType)) {
      await message.reply({ embeds: [errorEmbed('نوع لوق غير معروف.')] });
      return;
    }
    await prisma.guildLogChannel.upsert({
      where: { guildId_eventType: { guildId: guild.id, eventType } },
      update: { channelId },
      create: { guildId: guild.id, eventType, channelId },
    });
    await message.reply({ embeds: [successEmbed(`تم ضبط لوق ${eventType} على <#${channelId}>.`)] });
  },
};

const lremove: Command = {
  name: 'lremove',
  description: 'Delete all logs',
  category: 'logging',
  permission: 'admin',
  async execute({ message, guild }) {
    const rows = await prisma.guildLogChannel.findMany({ where: { guildId: guild.id } });
    for (const row of rows) {
      await guild.channels.delete(row.channelId).catch(() => {});
    }
    await prisma.guildLogChannel.deleteMany({ where: { guildId: guild.id } });
    await message.reply({ embeds: [successEmbed('تم حذف جميع قنوات اللوق.')] });
  },
};

export const loggingCommands: Command[] = [lsetup, logs, lremove];
