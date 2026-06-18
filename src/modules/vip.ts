import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  StringSelectMenuBuilder,
  EmbedBuilder,
} from 'discord.js';
import type { Command } from '../types/command.js';
import { baseEmbed, successEmbed, errorEmbed, infoEmbed, statusDone } from '../shared/embeds.js';
import { runFullSetup } from '../services/setup-service.js';
import { getGuildConfig } from '../database/guild-config.js';
import { openProtectionPanel } from '../services/protection-panel.js';
import { openInteractiveRolePanel } from '../services/interactive-role-panel.js';
import { openAdminRolePanel } from '../services/admin-role-panel.js';

interface Section {
  id: string;
  label: string;
  build(prefix: string): EmbedBuilder;
}

const SECTIONS: Section[] = [
  {
    id: 'setup',
    label: 'الإعداد الأولي',
    build: (p) =>
      baseEmbed()
        .setTitle('الإعداد الأولي التلقائي')
        .setDescription(
          'اضغط زر «تشغيل الإعداد الأولي» بالأسفل لإنشاء الكاتيجوري، الرولات (Muted / Prison / New / Unverified)، ' +
            'جميع قنوات اللوق، وتطبيق صلاحيات الإسكات على كل القنوات تلقائياً. يُزرع أيضاً قائمة أسباب العقوبات الافتراضية.\n\n' +
            `أوامر متعلقة: \`${p}lsetup sync\` (تحقق وإصلاح)، \`${p}lsetup\` (إعداد كامل)، \`${p}logs\`، \`${p}lremove\`، \`${p}blackchat\`.`,
        ),
  },
  {
    id: 'penalties',
    label: 'العقوبات',
    build: (p) =>
      baseEmbed()
        .setTitle('العقوبات')
        .setDescription(
          [
            `\`${p}mute @user\` — إسكات كتابي (رول Muted، يمنع الكتابة في كل القنوات النصية).`,
            `\`${p}prison @user\` — سجن (رول Prison).`,
            `\`${p}vmute @user\` — كتم صوتي عبر Server Mute فقط (لا رول، لا يمنع الكتابة).`,
            `\`${p}ban @user\`، \`${p}kick @user\` — قائمة أسباب تفاعلية.`,
            `\`${p}resons list\` — إدارة الأسباب والمدد (\`add\` / \`remove\` / \`edit\`).`,
            `\`${p}unmute\` / \`${p}unprison\` / \`${p}unvmute\` — فك العقوبات.`,
            `\`${p}penalties @user\`، \`${p}records @user\`، \`${p}exemption @user النوع\`.`,
            `\`${p}setpadmin\` — فك العقوبة للمُعطي فقط.`,
          ].join('\n'),
        ),
  },
  {
    id: 'roles',
    label: 'الرولات والأعضاء',
    build: (p) =>
      baseEmbed()
        .setTitle('الرولات والأعضاء')
        .setDescription(
          [
            `\`${p}autorole @role\` — رول تلقائي لكل عضو جديد.`,
            `\`${p}rolemulti @role [all|members|bots] [remove]\` — رول للجميع.`,
            `\`${p}antijoin <أيام>\` مع \`${p}setrjoin <ban|kick|prison>\` — الحسابات الجديدة.`,
            'نظام new والتفعيل يُداران من قسم «بوابة الأعضاء».',
            `\`${p}srole\`، \`${p}myrole\`، \`${p}reactrole\`، \`${p}setrole\`.`,
          ].join('\n'),
        ),
  },
  {
    id: 'gate',
    label: 'بوابة الأعضاء',
    build: (p) =>
      baseEmbed()
        .setTitle('بوابة الأعضاء')
        .setDescription(
          [
            'نظام new: الحسابات الأقل من عمر محدد تأخذ رول New وتُحجب عنها كل القنوات عدا قناة new.',
            'نظام التفعيل: العضو الجديد يأخذ رول Unverified حتى يُفعَّل يدوياً.',
            '',
            `\`${p}verify @عضو\` (أو \`فعل\`) — تفعيل عضو: إزالة Unverified ومنح الرولات التلقائية.`,
            `\`${p}setverify\` — تفعيل نظام التحقق وتطبيق صلاحيات القنوات.`,
            `\`${p}unsetverify\` — تعطيل نظام التحقق وإزالة صلاحيات Unverified من القنوات.`,
            `\`${p}setchannel new #قناة\` / \`${p}setchannel verify #قناة\`.`,
            `\`${p}setbanmsg <رسالة>\` لرسالة الحظر.`,
          ].join('\n'),
        ),
  },
  {
    id: 'logs',
    label: 'اللوقات',
    build: (p) =>
      baseEmbed()
        .setTitle('اللوقات')
        .setDescription(
          [
            `\`${p}lsetup sync\` — التحقق من النواقص وإصلاح صلاحيات رول Muted (بدون تكرار اللوقات).`,
            `\`${p}lsetup detailed\` — لوق مفصل (قناة لكل حدث).`,
            `\`${p}lsetup compact\` — لوق مختصر (تجميع الأحداث المتقاربة).`,
            `\`${p}logs <النوع> #قناة\` — توجيه نوع لوق لقناة.`,
            `\`${p}lremove\` — حذف كل اللوقات.`,
            '',
            'لوقات الصوت: join / leave / **change** (تغيير ذاتي) / move (سحب) / disconnect / mute / deafen.',
          ].join('\n'),
        ),
  },
  {
    id: 'interactive',
    label: 'الرولات التفاعلية',
    build: (p) =>
      baseEmbed()
        .setTitle('الرولات التفاعلية')
        .setDescription(
          [
            'اضبط صلاحيات الرولات: صور، منشن، بث، ميوت سيرفر، دفن سيرفر، وأوامر الإشراف.',
            `اختر هذا القسم لفتح اللوحة، أو استخدم \`${p}iroles\`.`,
          ].join('\n'),
        ),
  },
  {
    id: 'adminroles',
    label: 'الرولات الإدارية',
    build: (p) =>
      baseEmbed()
        .setTitle('الرولات الإدارية')
        .setDescription(
          [
            'اضبط الأوامر الإدارية لكل رول من الأعلى للأقل.',
            'رولات **Administrator** تحصل تلقائياً على الأوامر الإدارية (ما عدا أوامر المالك/الوايت لست).',
            `اختر هذا القسم لفتح اللوحة، أو استخدم \`${p}aroles\`.`,
          ].join('\n'),
        ),
  },
  {
    id: 'protection',
    label: 'الحماية',
    build: (p) =>
      baseEmbed()
        .setTitle('الحماية')
        .setDescription(
          [
            'لوحة تفاعلية لتشغيل/إيقاف الحماية وإدارة الوايت لست.',
            `اختر هذا القسم لفتح اللوحة، أو \`${p}protection panel\`.`,
            `أوامر نصية: \`${p}antidelete\`، \`${p}trustuser @user\`.`,
          ].join('\n'),
        ),
  },
  {
    id: 'appearance',
    label: 'مظهر البوت',
    build: (p) =>
      baseEmbed()
        .setTitle('مظهر البوت')
        .setDescription(
          [
            `\`${p}setname <اسم>\`، \`${p}setavatar\`، \`${p}setbanner\`.`,
            `\`${p}setactivity playing <نص>\` — نشاط البوت.`,
            `\`${p}setstatus dnd\` — حالة البوت (online / idle / dnd / invisible).`,
            `\`${p}setpcolor #hex\` — لون الإمبد.`,
          ].join('\n'),
        ),
  },
  {
    id: 'management',
    label: 'الإدارة',
    build: (p) =>
      baseEmbed()
        .setTitle('الإدارة')
        .setDescription(
          [
            `\`${p}setprefix <برفكس>\` — تغيير البرفكس.`,
            `\`${p}setnprefix\` — تشغيل الأوامر بدون برفكس.`,
            `\`${p}doadd\` / \`${p}dochange\` / \`${p}doremove\` / \`${p}dolist\` — أسماء بديلة للأوامر (عربي/مخصص).`,
            `\`${p}setowner @user\`، \`${p}owners\` — إدارة الأونرات.`,
            `\`${p}allow\` / \`${p}deny\` / \`${p}list\`، \`${p}cmd <أمر> <on|off>\`.`,
            `\`${p}settings\`، \`${p}restart\`.`,
          ].join('\n'),
        ),
  },
];

function buildComponents(disabled = false) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('vip-section')
    .setPlaceholder('اختر قسم الإعدادات')
    .setDisabled(disabled)
    .addOptions(SECTIONS.map((s) => ({ label: s.label, value: s.id })));

  const setupButton = new ButtonBuilder()
    .setCustomId('vip-run-setup')
    .setLabel('تشغيل الإعداد الأولي')
    .setStyle(ButtonStyle.Success)
    .setDisabled(disabled);

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
    new ActionRowBuilder<ButtonBuilder>().addComponents(setupButton),
  ];
}

const vip: Command = {
  name: 'vip',
  description: 'Edit Bot',
  category: 'vip',
  permission: 'admin',
  async execute({ message, guild, member }) {
    const cfg = await getGuildConfig(guild.id);
    const home = baseEmbed()
      .setTitle('لوحة تحكم SysBot')
      .setDescription(
        `مرحباً ${member}. اختر قسماً من القائمة بالأسفل لعرض إعداداته وأوامره.\n\n` +
          `البرفكس الحالي: \`${cfg.prefix}\`\n` +
          `حالة الإعداد الأولي: ${statusDone(cfg.setupDone)}`,
      )
      .setThumbnail(guild.iconURL({ size: 256 }));

    const panel = await message.reply({ embeds: [home], components: buildComponents() });

    const collector = panel.createMessageComponentCollector({
      time: 180_000,
      filter: (i) => i.user.id === member.id,
    });

    collector.on('collect', async (interaction) => {
      if (interaction.componentType === ComponentType.StringSelect) {
        const section = SECTIONS.find((s) => s.id === interaction.values[0]);
        if (section) {
          if (section.id === 'protection') {
            await interaction.deferUpdate();
            await openProtectionPanel(panel, guild, member.id);
            return;
          }
          if (section.id === 'interactive') {
            await interaction.deferUpdate();
            await openInteractiveRolePanel(panel, guild, member.id);
            return;
          }
          if (section.id === 'adminroles') {
            await interaction.deferUpdate();
            await openAdminRolePanel(panel, guild, member.id);
            return;
          }
          await interaction.update({ embeds: [section.build(cfg.prefix)], components: buildComponents() });
        }
        return;
      }
      if (interaction.componentType === ComponentType.Button && interaction.customId === 'vip-run-setup') {
        await interaction.update({
          embeds: [infoEmbed('جارٍ تنفيذ الإعداد الأولي. يرجى الانتظار.')],
          components: buildComponents(true),
        });
        try {
          const progress = await runFullSetup(guild);
          await interaction.editReply({
            embeds: [
              successEmbed(
                `اكتمل الإعداد.\n` +
                  `- الرولات: ${progress.rolesCreated}\n` +
                  `- قنوات اللوق: ${progress.logChannelsCreated}\n` +
                  `- صلاحيات الإسكات المطبّقة: ${progress.overwritesApplied}`,
              ),
            ],
            components: buildComponents(),
          });
        } catch {
          await interaction.editReply({
            embeds: [
              errorEmbed(
                'تعذّر إكمال الإعداد. تأكد أن البوت يملك صلاحية الإدارة وأن ترتيب رتبته أعلى من الرولات المستهدفة.',
              ),
            ],
            components: buildComponents(),
          });
        }
      }
    });

    collector.on('end', () => {
      panel.edit({ components: buildComponents(true) }).catch(() => {});
    });
  },
};

export const vipCommands: Command[] = [vip];
