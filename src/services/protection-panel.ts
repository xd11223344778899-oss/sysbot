import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Guild,
  type Message,
} from 'discord.js';
import { getGuildConfig, updateGuildConfig } from '../database/guild-config.js';
import { baseEmbed, statusOnOff, successEmbed } from '../shared/embeds.js';
import {
  isTrusted,
  listTrustedUsers,
  toggleTrustEntry,
  updateProtectionToggle,
} from './trust-service.js';

const PANEL_TTL_MS = 300_000;

function buildProtectionEmbed(cfg: Awaited<ReturnType<typeof getGuildConfig>>) {
  return baseEmbed()
    .setTitle('لوحة الحماية')
    .setDescription(
      [
        `antidelete: ${statusOnOff(cfg.antiDelete)}`,
        `antiperms: ${statusOnOff(cfg.antiPerms)}`,
        `antibots: ${statusOnOff(cfg.antiBots)}`,
        `antilinks: ${statusOnOff(cfg.antiLinks)}`,
        `antiword: ${statusOnOff(cfg.antiWord)}`,
        `spam: ${cfg.spamEnabled ? `${cfg.spamMessages}/${cfg.spamSeconds}s` : 'معطّل'}`,
        `حد المخالفات: ${cfg.protectionLimit}`,
        `كلمات محظورة: ${cfg.bannedWords.length}`,
      ].join('\n'),
    );
}

function buildProtectionComponents() {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('prot:t:antiDelete').setLabel('antidelete').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('prot:t:antiPerms').setLabel('antiperms').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('prot:t:antiBots').setLabel('antibots').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('prot:t:antiLinks').setLabel('antilinks').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('prot:t:antiWord').setLabel('antiword').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('prot:spam').setLabel('إعداد السبام').setStyle(ButtonStyle.Primary),
  );
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('prot:whitelist').setLabel('الوايت لست').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('prot:words').setLabel('الكلمات').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('prot:refresh').setLabel('تحديث').setStyle(ButtonStyle.Success),
  );
  return [row1, row2, row3];
}

export async function openProtectionPanel(
  message: Message<true>,
  guild: Guild,
  userId: string,
): Promise<void> {
  const cfg = await getGuildConfig(guild.id);
  const panel = await message.reply({
    embeds: [buildProtectionEmbed(cfg)],
    components: buildProtectionComponents(),
  });

  const collector = panel.createMessageComponentCollector({
    time: PANEL_TTL_MS,
    filter: (i) => i.user.id === userId,
  });

  collector.on('collect', async (interaction) => {
    if (interaction.isButton() && interaction.customId.startsWith('prot:t:')) {
      const key = interaction.customId.slice('prot:t:'.length) as
        | 'antiDelete'
        | 'antiPerms'
        | 'antiBots'
        | 'antiLinks'
        | 'antiWord';
      const fresh = await getGuildConfig(guild.id);
      await updateProtectionToggle(guild.id, key, !fresh[key]);
      const updated = await getGuildConfig(guild.id);
      await interaction.update({
        embeds: [buildProtectionEmbed(updated)],
        components: buildProtectionComponents(),
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'prot:spam') {
      const modal = new ModalBuilder().setCustomId('prot:spammodal').setTitle('إعداد السبام');
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('messages')
            .setLabel('عدد الرسائل')
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('seconds')
            .setLabel('خلال ثواني')
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isButton() && interaction.customId === 'prot:whitelist') {
      const users = await listTrustedUsers(guild.id);
      await interaction.reply({
        embeds: [
          baseEmbed()
            .setTitle('الوايت لست')
            .setDescription(users.map((id) => `<@${id}>`).join('\n') || 'فارغة'),
        ],
        ephemeral: true,
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'prot:words') {
      const fresh = await getGuildConfig(guild.id);
      await interaction.reply({
        embeds: [
          baseEmbed()
            .setTitle('الكلمات المحظورة')
            .setDescription(fresh.bannedWords.join(', ') || 'لا يوجد'),
        ],
        ephemeral: true,
      });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'prot:refresh') {
      const updated = await getGuildConfig(guild.id);
      await interaction.update({
        embeds: [buildProtectionEmbed(updated)],
        components: buildProtectionComponents(),
      });
    }
  });

  collector.on('end', () => {
    panel.edit({ components: [] }).catch(() => {});
  });
}

export async function handleProtectionModal(
  interaction: import('discord.js').ModalSubmitInteraction,
): Promise<boolean> {
  if (interaction.customId !== 'prot:spammodal' || !interaction.guild) return false;
  const messages = parseInt(interaction.fields.getTextInputValue('messages'), 10);
  const seconds = parseInt(interaction.fields.getTextInputValue('seconds'), 10);
  if (!messages || !seconds) {
    await interaction.reply({ embeds: [successEmbed('قيم غير صالحة.')], ephemeral: true });
    return true;
  }
  await updateGuildConfig(interaction.guild.id, {
    spamEnabled: true,
    spamMessages: messages,
    spamSeconds: seconds,
  });
  await interaction.reply({
    embeds: [successEmbed(`تم ضبط السبام: ${messages} رسائل خلال ${seconds} ثانية.`)],
    ephemeral: true,
  });
  return true;
}

export { isTrusted, toggleTrustEntry, listTrustedUsers };
