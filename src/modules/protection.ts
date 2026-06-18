import type { Command } from '../types/command.js';
import type { AntijoinAction } from '../shared/enums.js';
import { successEmbed, errorEmbed, baseEmbed, statusOnOff } from '../shared/embeds.js';
import { resolveMember } from '../shared/resolvers.js';
import { prisma } from '../database/prisma.js';
import { getGuildConfig, updateGuildConfig } from '../database/guild-config.js';
import { openProtectionPanel } from '../services/protection-panel.js';
import { toggleTrustEntry, listTrustedUsers } from '../services/trust-service.js';

function makeToggleCommand(
  name: string,
  description: string,
  key: 'antiDelete' | 'antiLinks' | 'antiPerms' | 'antiBots' | 'antiWord',
): Command {
  return {
    name,
    description,
    category: 'protection',
    permission: 'admin',
    usage: '(تبديل تشغيل/إيقاف)',
    async execute({ message, guild, config }) {
      const next = !config[key];
      await updateGuildConfig(guild.id, { [key]: next });
      await message.reply({ embeds: [successEmbed(`${name}: ${statusOnOff(next)}`)] });
    },
  };
}

const antidelete = makeToggleCommand('antidelete', 'Anti delete channels or roles', 'antiDelete');
const antilinks = makeToggleCommand('antilinks', 'Disallow links from chat', 'antiLinks');
const antiperms = makeToggleCommand('antiperms', 'Protection from edit roles permissions', 'antiPerms');
const antibots = makeToggleCommand('antibots', 'If bot join server the bot kicked from server', 'antiBots');

const antiword: Command = {
  name: 'antiword',
  description: 'If user post inappropriate words, the user will be get text mute',
  category: 'protection',
  permission: 'admin',
  usage: '[add <word> | remove <word> | toggle]',
  async execute({ message, guild, args, config }) {
    const sub = args[0]?.toLowerCase();
    if (sub === 'add' && args[1]) {
      const words = [...new Set([...config.bannedWords, args[1].toLowerCase()])];
      await updateGuildConfig(guild.id, { bannedWords: words, antiWord: true });
      await message.reply({ embeds: [successEmbed(`تمت إضافة الكلمة (${words.length}).`)] });
    } else if (sub === 'remove' && args[1]) {
      const words = config.bannedWords.filter((w) => w !== args[1].toLowerCase());
      await updateGuildConfig(guild.id, { bannedWords: words });
      await message.reply({ embeds: [successEmbed('تمت إزالة الكلمة.')] });
    } else {
      await updateGuildConfig(guild.id, { antiWord: !config.antiWord });
      await message.reply({
        embeds: [successEmbed(`antiword: ${statusOnOff(!config.antiWord)}`)],
      });
    }
  },
};

const spam: Command = {
  name: 'spam',
  description: 'Set spam limits',
  category: 'protection',
  permission: 'admin',
  usage: '<messages> <seconds> | off',
  async execute({ message, guild, args }) {
    if (args[0]?.toLowerCase() === 'off') {
      await updateGuildConfig(guild.id, { spamEnabled: false });
      await message.reply({ embeds: [successEmbed('تم تعطيل مكافحة السبام.')] });
      return;
    }
    const messages = parseInt(args[0] ?? '', 10);
    const seconds = parseInt(args[1] ?? '', 10);
    if (!messages || !seconds) {
      await message.reply({ embeds: [errorEmbed('استخدم: spam <عدد الرسائل> <الثواني>.')] });
      return;
    }
    await updateGuildConfig(guild.id, { spamEnabled: true, spamMessages: messages, spamSeconds: seconds });
    await message.reply({ embeds: [successEmbed(`تم ضبط السبام: ${messages} رسائل خلال ${seconds} ثانية.`)] });
  },
};

const antijoin: Command = {
  name: 'antijoin',
  description: 'Ban or prison new accounts',
  category: 'protection',
  permission: 'admin',
  usage: '<days> | off',
  async execute({ message, guild, args, config }) {
    if (args[0]?.toLowerCase() === 'off') {
      await updateGuildConfig(guild.id, { antijoinEnabled: false });
      await message.reply({ embeds: [successEmbed('تم تعطيل antijoin.')] });
      return;
    }
    const days = parseInt(args[0] ?? '', 10);
    if (!days) {
      await message.reply({ embeds: [errorEmbed('استخدم: antijoin <عدد الأيام> | off.')] });
      return;
    }
    await updateGuildConfig(guild.id, { antijoinEnabled: true, antijoinMinAgeDays: days });
    await message.reply({
      embeds: [successEmbed(`antijoin مفعّل للحسابات أقل من ${days} يوم. الإجراء الحالي: ${config.antijoinAction}.`)],
    });
  },
};

const setrjoin: Command = {
  name: 'setrjoin',
  description: 'Set new accounts action',
  category: 'protection',
  permission: 'admin',
  usage: '<none|ban|kick|prison>',
  async execute({ message, guild, args }) {
    const action = args[0]?.toUpperCase();
    if (!['NONE', 'BAN', 'KICK', 'PRISON'].includes(action ?? '')) {
      await message.reply({ embeds: [errorEmbed('اختر: none | ban | kick | prison.')] });
      return;
    }
    await updateGuildConfig(guild.id, { antijoinAction: action as AntijoinAction });
    await message.reply({ embeds: [successEmbed(`تم ضبط إجراء الحسابات الجديدة على ${action}.`)] });
  },
};

const bblack: Command = {
  name: 'bblack',
  description: 'Block user from join server',
  category: 'protection',
  permission: 'admin',
  usage: '<userId>',
  async execute({ message, guild, args }) {
    const id = args[0]?.replace(/\D/g, '');
    if (!id) {
      await message.reply({ embeds: [errorEmbed('حدد معرف العضو.')] });
      return;
    }
    await guild.bans.create(id, { reason: 'bblack' }).then(
      () => message.reply({ embeds: [successEmbed('تم منع العضو من الدخول (حظر).')] }),
      () => message.reply({ embeds: [errorEmbed('تعذّر الحظر.')] }),
    );
  },
};

const trustuser: Command = {
  name: 'trustuser',
  description: 'Add or remove user to trustlist',
  category: 'protection',
  permission: 'owner',
  usage: '<@user>',
  async execute({ message, guild, args }) {
    const target = await resolveMember(guild, args[0]);
    if (!target) {
      await message.reply({ embeds: [errorEmbed('حدد عضو صحيح.')] });
      return;
    }
    const added = await toggleTrustEntry(guild.id, target.id);
    await message.reply({
      embeds: [
        successEmbed(
          added
            ? `تمت إضافة ${target} للوايت لست.`
            : `تمت إزالة ${target} من الوايت لست.`,
        ),
      ],
    });
  },
};

const trustlist: Command = {
  name: 'trustlist',
  description: 'Show trust list',
  category: 'protection',
  permission: 'mod',
  async execute({ message, guild }) {
    const entries = await listTrustedUsers(guild.id);
    await message.reply({
      embeds: [
        baseEmbed()
          .setTitle('قائمة الموثوقين')
          .setDescription(entries.map((id) => `<@${id}>`).join('\n') || 'لا يوجد'),
      ],
    });
  },
};

const createlimit: Command = {
  name: 'createlimit',
  description: 'Set the auto protection limit',
  category: 'protection',
  permission: 'admin',
  usage: '<number>',
  async execute({ message, guild, args }) {
    const limit = parseInt(args[0] ?? '', 10);
    if (!limit) {
      await message.reply({ embeds: [errorEmbed('حدد رقم الحد.')] });
      return;
    }
    await updateGuildConfig(guild.id, { protectionLimit: limit });
    await message.reply({ embeds: [successEmbed(`تم ضبط حد الحماية على ${limit}.`)] });
  },
};

const protection: Command = {
  name: 'protection',
  description: 'Set protection settings',
  category: 'protection',
  permission: 'admin',
  usage: '[panel]',
  async execute({ message, guild, member, args }) {
    if (args[0]?.toLowerCase() === 'panel') {
      await openProtectionPanel(message, guild, member.id);
      return;
    }
    const cfg = await getGuildConfig(guild.id);
    await message.reply({
      embeds: [
        baseEmbed()
          .setTitle('إعدادات الحماية')
          .setDescription(
            [
              `antidelete: ${statusOnOff(cfg.antiDelete)}`,
              `antilinks: ${statusOnOff(cfg.antiLinks)}`,
              `antiperms: ${statusOnOff(cfg.antiPerms)}`,
              `antibots: ${statusOnOff(cfg.antiBots)}`,
              `antiword: ${statusOnOff(cfg.antiWord)}`,
              `antijoin: ${cfg.antijoinEnabled ? `مفعّل (${cfg.antijoinMinAgeDays} يوم / ${cfg.antijoinAction})` : 'معطّل'}`,
              `spam: ${cfg.spamEnabled ? `مفعّل (${cfg.spamMessages} رسالة / ${cfg.spamSeconds} ثانية)` : 'معطّل'}`,
              `حد الحماية: ${cfg.protectionLimit}`,
            ].join('\n'),
          ),
      ],
    });
  },
};

function makeWantiCommand(name: string, description: string): Command {
  return {
    name,
    description,
    category: 'protection',
    permission: 'owner',
    usage: name === 'wanti' ? '<@user>' : '',
    async execute({ message, guild, args }) {
      if (name === 'wantilist') {
        const entries = await listTrustedUsers(guild.id);
        await message.reply({
          embeds: [
            baseEmbed()
              .setTitle('الوايت لست')
              .setDescription(entries.map((id) => `<@${id}>`).join('\n') || 'لا يوجد'),
          ],
        });
        return;
      }
      const target = await resolveMember(guild, args[0]);
      if (!target) {
        await message.reply({ embeds: [errorEmbed('حدد عضو صحيح.')] });
        return;
      }
      const added = await toggleTrustEntry(guild.id, target.id);
      await message.reply({
        embeds: [
          successEmbed(
            added
              ? `تمت إضافة ${target} للوايت لست.`
              : `تمت إزالة ${target} من الوايت لست.`,
          ),
        ],
      });
    },
  };
}

const wanti = makeWantiCommand('wanti', 'Allow or deny user to delete roles or channels');
const wantilist = makeWantiCommand('wantilist', 'Allow or deny user to delete roles or channels');

function makeCollectionCommand(name: string, description: string): Command {
  return {
    name,
    description,
    category: 'protection',
    permission: 'admin',
    usage: '<name> [json]',
    async execute({ message, guild, args, rest }) {
      const collName = args[0];
      if (!collName) {
        const all = await prisma.antiCollection.findMany({ where: { guildId: guild.id } });
        await message.reply({
          embeds: [
            baseEmbed()
              .setTitle('المجموعات')
              .setDescription(all.map((c) => `\`${c.name}\``).join('\n') || 'لا يوجد'),
          ],
        });
        return;
      }
      const payload = rest.slice(collName.length).trim();
      let data: unknown = {};
      if (payload) {
        try {
          data = JSON.parse(payload);
        } catch {
          await message.reply({ embeds: [errorEmbed('صيغة JSON غير صحيحة.')] });
          return;
        }
      }
      const serialized = JSON.stringify(data);
      await prisma.antiCollection.upsert({
        where: { guildId_name: { guildId: guild.id, name: collName } },
        update: { data: serialized },
        create: { guildId: guild.id, name: collName, data: serialized },
      });
      await message.reply({ embeds: [successEmbed(`تم حفظ المجموعة ${collName}.`)] });
    },
  };
}

const collection = makeCollectionCommand('collection', 'Edit anti role settings');
const ecollection = makeCollectionCommand('ecollection', 'Edit collections');

export const protectionCommands: Command[] = [
  antidelete,
  antilinks,
  antiperms,
  antibots,
  antiword,
  spam,
  antijoin,
  setrjoin,
  bblack,
  trustuser,
  trustlist,
  createlimit,
  protection,
  wanti,
  wantilist,
  collection,
  ecollection,
];
