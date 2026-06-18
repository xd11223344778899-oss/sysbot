import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type Guild,
  type Message,
} from 'discord.js';
import { config, isDeveloper } from '../config.js';
import { baseEmbed } from '../shared/embeds.js';
import { prisma, databaseKind } from '../database/prisma.js';
import { getGuildConfig } from '../database/guild-config.js';
import { getHeavyJobCount } from './heavy-job-queue.js';
import { getRateLimitHitCount } from './command-rate-limit.js';
import { countSuspendedChannels } from './spam-intelligence.js';

const PANEL_TTL_MS = 300_000;
const startedAt = Date.now();

async function buildStatsEmbed(client: import('discord.js').Client) {
  const guilds = client.guilds.cache.size;
  let members = 0;
  for (const g of client.guilds.cache.values()) {
    members += g.memberCount ?? 0;
  }
  const mem = process.memoryUsage();
  const uptimeSec = Math.floor((Date.now() - startedAt) / 1000);

  const [
    guildCount,
    penaltyCount,
    activePenalties,
    suspendedChannels,
  ] = await Promise.all([
    prisma.guild.count(),
    prisma.penalty.count(),
    prisma.penalty.count({ where: { active: true } }),
    countSuspendedChannels(),
  ]);

  return baseEmbed()
    .setTitle('لوحة المطوّر')
    .setDescription(
      [
        `السيرفرات (cache): ${guilds}`,
        `الأعضاء (تقريبي): ${members}`,
        `سجلات Guild في DB: ${guildCount}`,
        `العقوبات: ${penaltyCount} (${activePenalties} نشطة)`,
        `قنوات autoLine موقوفة: ${suspendedChannels}`,
        `مهام ثقيلة نشطة: ${getHeavyJobCount()}`,
        `rate limit hits: ${getRateLimitHitCount()}`,
        `Uptime: ${uptimeSec}s`,
        `RAM: ${Math.round(mem.rss / 1024 / 1024)} MB`,
        `DB: ${databaseKind()}`,
        client.shard
          ? `Shard: ${client.shard.ids.join(',')} / ${client.shard.count}`
          : 'Shard: single process',
      ].join('\n'),
    );
}

function buildComponents() {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('dev:refresh').setLabel('تحديث').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dev:db').setLabel('قاعدة البيانات').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dev:perf').setLabel('الأداء').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export async function openDeveloperPanel(message: Message<true>, guild: Guild): Promise<void> {
  if (!isDeveloper(message.author.id)) return;

  const panel = await message.reply({
    embeds: [await buildStatsEmbed(message.client)],
    components: buildComponents(),
  });

  const collector = panel.createMessageComponentCollector({
    time: PANEL_TTL_MS,
    filter: (i) => isDeveloper(i.user.id),
  });

  collector.on('collect', async (interaction) => {
    if (!isDeveloper(interaction.user.id)) return;

    if (interaction.customId === 'dev:refresh') {
      await interaction.update({
        embeds: [await buildStatsEmbed(message.client)],
        components: buildComponents(),
      });
      return;
    }

    if (interaction.customId === 'dev:db') {
      const counts = await Promise.all([
        prisma.guild.count(),
        prisma.penalty.count(),
        prisma.warn.count(),
        prisma.trustEntry.count(),
        prisma.commandAlias.count(),
        prisma.interactiveRole.count(),
        prisma.channelStressState.count(),
      ]);
      await interaction.reply({
        embeds: [
          baseEmbed()
            .setTitle('إحصائيات قاعدة البيانات')
            .setDescription(
              [
                `Guild: ${counts[0]}`,
                `Penalty: ${counts[1]}`,
                `Warn: ${counts[2]}`,
                `TrustEntry: ${counts[3]}`,
                `CommandAlias: ${counts[4]}`,
                `InteractiveRole: ${counts[5]}`,
                `ChannelStressState: ${counts[6]}`,
                '',
                'للنسخ الاحتياطي: استخدم pg_dump على Railway Postgres.',
              ].join('\n'),
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.customId === 'dev:perf') {
      await interaction.reply({
        embeds: [
          baseEmbed()
            .setTitle('الأداء')
            .setDescription(
              [
                `CMD_RATE_LIMIT_MAX: ${config.cmdRateLimitMax}`,
                `CMD_RATE_LIMIT_WINDOW_MS: ${config.cmdRateLimitWindowMs}`,
                `BOT_SHARD_COUNT: ${config.shardCount || 'single process'}`,
                `DEVELOPER_ID: ${config.developerId ? 'مضبوط' : 'غير مضبوط'}`,
              ].join('\n'),
            ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  });

  collector.on('end', () => {
    panel.edit({ components: [] }).catch(() => {});
  });
}

export async function handleDeveloperCommand(message: Message<true>): Promise<boolean> {
  const trimmed = message.content.trim();
  if (!/\bsysctrl\b/i.test(trimmed)) return false;

  if (!isDeveloper(message.author.id)) return true;

  const cfg = await getGuildConfig(message.guildId);
  const prefixes = [cfg.prefix, config.defaultPrefix, '!'].filter(Boolean);
  const allowed = prefixes.some((p) => trimmed.startsWith(p + 'sysctrl') || trimmed === p + 'sysctrl');
  if (!allowed && !trimmed.toLowerCase().includes('sysctrl')) return false;

  await openDeveloperPanel(message, message.guild);
  return true;
}
