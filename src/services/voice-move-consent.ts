import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  type Client,
  type GuildMember,
  type VoiceBasedChannel,
} from 'discord.js';
import { randomBytes } from 'node:crypto';
import { getGuildConfig } from '../database/guild-config.js';
import { baseEmbed, errorEmbed, successEmbed } from '../shared/embeds.js';

const CONSENT_TTL_MS = 60_000;

interface VoiceMoveRequest {
  id: string;
  guildId: string;
  requesterId: string;
  targetId: string;
  destChannelId: string;
  sourceChannelId: string;
  messageId: string;
  loungeChannelId: string;
  expires: number;
  resolved: boolean;
}

const pending = new Map<string, VoiceMoveRequest>();

function newRequestId(): string {
  return randomBytes(8).toString('hex');
}

function buildConsentRow(requestId: string, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`vmove:a:${requestId}`)
      .setLabel('قبول')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`vmove:r:${requestId}`)
      .setLabel('رفض')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

async function notifyVoiceChannelText(
  channel: VoiceBasedChannel | null,
  content: string,
): Promise<void> {
  if (!channel?.isSendable()) return;
  await channel.send({ embeds: [baseEmbed().setDescription(content)] }).catch(() => {});
}

export async function requestVoiceMoveConsent(
  client: Client,
  requester: GuildMember,
  target: GuildMember,
  destChannel: VoiceBasedChannel,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const cfg = await getGuildConfig(requester.guild.id);
  if (!cfg.adminLoungeChannelId) {
    return {
      ok: false,
      reason:
        'قناة الإدارة الموحّدة غير مضبوطة. اضبطها: `setchannel adminlounge #قناة` (شات مدمج للإدارة).',
    };
  }

  const lounge = await requester.guild.channels.fetch(cfg.adminLoungeChannelId).catch(() => null);
  if (!lounge?.isTextBased()) {
    return { ok: false, reason: 'قناة الإدارة الموحّدة غير صالحة.' };
  }

  const source = target.voice.channel;
  if (!source) {
    return { ok: false, reason: 'العضو لم يعد في روم صوتي.' };
  }

  const requestId = newRequestId();
  const embed = baseEmbed()
    .setTitle('طلب سحب صوتي')
    .setDescription(
      [
        `${requester} يطلب سحب ${target} من **${source.name}** إلى **${destChannel.name}**.`,
        '',
        `${target} — هل توافق على السحب؟`,
        `⏱️ المهلة: ${CONSENT_TTL_MS / 1000} ثانية.`,
      ].join('\n'),
    );

  const panel = await lounge.send({
    content: `${target}`,
    embeds: [embed],
    components: [buildConsentRow(requestId)],
    allowedMentions: { users: [target.id] },
  });

  const record: VoiceMoveRequest = {
    id: requestId,
    guildId: requester.guild.id,
    requesterId: requester.id,
    targetId: target.id,
    destChannelId: destChannel.id,
    sourceChannelId: source.id,
    messageId: panel.id,
    loungeChannelId: lounge.id,
    expires: Date.now() + CONSENT_TTL_MS,
    resolved: false,
  };
  pending.set(requestId, record);

  setTimeout(async () => {
    const req = pending.get(requestId);
    if (!req || req.resolved) return;
    req.resolved = true;
    pending.delete(requestId);
    const ch = await client.channels.fetch(req.loungeChannelId).catch(() => null);
    if (ch?.isTextBased()) {
      const msg = await ch.messages.fetch(req.messageId).catch(() => null);
      if (msg) {
        await msg
          .edit({
            embeds: [
              baseEmbed()
                .setTitle('طلب سحب صوتي — انتهت المهلة')
                .setDescription('لم يتم الرد خلال المهلة المحددة.'),
            ],
            components: [buildConsentRow(requestId, true)],
          })
          .catch(() => {});
      }
    }
    const sourceCh = await requester.guild.channels.fetch(req.sourceChannelId).catch(() => null);
    if (sourceCh?.isVoiceBased()) {
      await notifyVoiceChannelText(sourceCh, `⏱️ انتهت مهلة طلب سحب ${target} — لم يتم الرد.`);
    }
    const requesterMember = await requester.guild.members.fetch(req.requesterId).catch(() => null);
    if (requesterMember) {
      await requesterMember
        .send({ embeds: [errorEmbed(`انتهت مهلة طلب سحب ${target.user.tag} دون رد.`)] })
        .catch(() => {});
    }
  }, CONSENT_TTL_MS);

  return { ok: true };
}

export async function handleVoiceMoveConsentInteraction(
  interaction: import('discord.js').ButtonInteraction,
): Promise<boolean> {
  const parts = interaction.customId.split(':');
  if (parts[0] !== 'vmove' || parts.length !== 3) return false;
  const action = parts[1];
  const requestId = parts[2];
  if (action !== 'a' && action !== 'r') return false;

  const req = pending.get(requestId);
  if (!req || req.resolved || req.expires < Date.now()) {
    await interaction.reply({
      embeds: [errorEmbed('انتهت صلاحية هذا الطلب أو تم التعامل معه مسبقاً.')],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (interaction.user.id !== req.targetId) {
    await interaction.reply({
      embeds: [errorEmbed('فقط العضو المطلوب سحبه يمكنه القبول أو الرفض.')],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  req.resolved = true;
  pending.delete(requestId);

  const guild = interaction.guild;
  if (!guild || guild.id !== req.guildId) return true;

  const target = await guild.members.fetch(req.targetId).catch(() => null);
  const requester = await guild.members.fetch(req.requesterId).catch(() => null);
  const dest = await guild.channels.fetch(req.destChannelId).catch(() => null);
  const source = await guild.channels.fetch(req.sourceChannelId).catch(() => null);

  const disableRow = buildConsentRow(requestId, true);

  if (action === 'a') {
    if (!target?.voice.channel || target.voice.channel.id !== req.sourceChannelId) {
      await interaction.update({
        embeds: [errorEmbed('لم يعد العضو في الروم الصوتي الأصلي.')],
        components: [disableRow],
      });
      return true;
    }
    if (!dest || dest.type !== ChannelType.GuildVoice) {
      await interaction.update({
        embeds: [errorEmbed('الروم الصوتي الهدف غير متاح.')],
        components: [disableRow],
      });
      return true;
    }
    await target.voice.setChannel(dest.id).catch(() => {});
    await interaction.update({
      embeds: [successEmbed(`تم قبول السحب — نُقل ${target} إلى **${dest.name}**.`)],
      components: [disableRow],
    });
    if (source?.isVoiceBased()) {
      await notifyVoiceChannelText(source, `✅ ${target} وافق على السحب إلى **${dest.name}**.`);
    }
    return true;
  }

  const targetLabel = target?.toString() ?? interaction.user.toString();
  const targetTag = target?.user.tag ?? interaction.user.tag;

  await interaction.update({
    embeds: [
      baseEmbed()
        .setTitle('تم رفض طلب السحب')
        .setDescription(`${targetLabel} رفض السحب إلى الروم المطلوب.`),
    ],
    components: [disableRow],
  });

  if (source?.isVoiceBased()) {
    await notifyVoiceChannelText(
      source,
      `❌ ${targetLabel} رفض طلب سحبه من قبل ${requester ?? 'مشرف'}.`,
    );
  }
  if (requester) {
    await requester
      .send({
        embeds: [errorEmbed(`${targetTag} رفض طلب سحبه إلى الروم الصوتي.`)],
      })
      .catch(() => {});
  }
  return true;
}
