import type { Command } from '../types/command.js';
import { successEmbed, errorEmbed, baseEmbed, statusOnOff, statusDone } from '../shared/embeds.js';
import { resolveMember, resolveRole, parseDuration } from '../shared/resolvers.js';
import { prisma } from '../database/prisma.js';
import { getGuildConfig, updateGuildConfig } from '../database/guild-config.js';
import { registry } from '../core/command-registry.js';
import {
  getPunishReasons,
  savePunishReasons,
  formatDurationMs,
} from '../services/punish-reasons-service.js';
import type { PunishApplicableType } from '../shared/punish-reasons.js';
import { SYSTEM_ROLES, VERIFY_CHANNEL_NAME } from '../shared/constants.js';
import { ensureGateChannel } from '../services/member-gate.js';
import {
  applyUnverifiedOverwritesToGuild,
  removeUnverifiedOverwritesFromGuild,
  formatVerifyOverwriteStats,
} from '../services/verify-overwrites.js';
import { randomBytes } from 'node:crypto';

function parseIds(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function resolveTarget(guild: any, token: string | undefined) {
  const member = await resolveMember(guild, token);
  if (member) return { id: member.id, type: 'USER' as const, mention: `${member}` };
  const role = resolveRole(guild, token);
  if (role) return { id: role.id, type: 'ROLE' as const, mention: `${role}` };
  return null;
}

function makeAccessCommand(name: string, description: string, mode: 'ALLOW' | 'DENY'): Command {
  return {
    name,
    description,
    category: 'vip',
    permission: 'admin',
    usage: '<@user|@role>',
    async execute({ message, guild, args }) {
      const target = await resolveTarget(guild, args[0]);
      if (!target) {
        await message.reply({ embeds: [errorEmbed('حدد عضو أو رول.')] });
        return;
      }
      const existing = await prisma.accessEntry.findUnique({
        where: { guildId_targetId_mode: { guildId: guild.id, targetId: target.id, mode } },
      });
      if (existing) {
        await prisma.accessEntry.delete({ where: { id: existing.id } });
        await message.reply({ embeds: [successEmbed(`تم إزالة ${target.mention} من قائمة ${mode}.`)] });
      } else {
        await prisma.accessEntry.create({
          data: { guildId: guild.id, targetId: target.id, type: target.type, mode },
        });
        await message.reply({ embeds: [successEmbed(`تمت إضافة ${target.mention} إلى قائمة ${mode}.`)] });
      }
    },
  };
}

const allow = makeAccessCommand('allow', 'Allow user or role to use commands', 'ALLOW');
const deny = makeAccessCommand('deny', 'Deny user or role to use commands', 'DENY');

const list: Command = {
  name: 'list',
  description: 'Show allow list',
  category: 'vip',
  permission: 'mod',
  async execute({ message, guild }) {
    const entries = await prisma.accessEntry.findMany({ where: { guildId: guild.id } });
    const allowList = entries.filter((e) => e.mode === 'ALLOW');
    const denyList = entries.filter((e) => e.mode === 'DENY');
    const fmt = (e: (typeof entries)[number]) => (e.type === 'USER' ? `<@${e.targetId}>` : `<@&${e.targetId}>`);
    await message.reply({
      embeds: [
        baseEmbed()
          .setTitle('قوائم الصلاحيات')
          .addFields(
            { name: 'مسموح', value: allowList.map(fmt).join('\n') || 'لا يوجد' },
            { name: 'محظور', value: denyList.map(fmt).join('\n') || 'لا يوجد' },
          ),
      ],
    });
  },
};

const cmd: Command = {
  name: 'cmd',
  description: 'Edit command settings',
  category: 'vip',
  permission: 'admin',
  usage: '<commandName> <on|off|role @role|user @user>',
  async execute({ message, guild, args }) {
    const commandName = args[0]?.toLowerCase();
    const command = commandName ? registry.get(commandName) : undefined;
    if (!command) {
      await message.reply({ embeds: [errorEmbed('اسم أمر غير معروف.')] });
      return;
    }
    const action = args[1]?.toLowerCase();
    const existing = await prisma.commandConfig.findUnique({
      where: { guildId_commandName: { guildId: guild.id, commandName: command.name } },
    });
    if (action === 'on' || action === 'off') {
      await prisma.commandConfig.upsert({
        where: { guildId_commandName: { guildId: guild.id, commandName: command.name } },
        update: { enabled: action === 'on' },
        create: { guildId: guild.id, commandName: command.name, enabled: action === 'on' },
      });
      await message.reply({ embeds: [successEmbed(`الأمر ${command.name}: ${action === 'on' ? 'مُفعّل' : 'مُعطّل'}.`)] });
      return;
    }
    if (action === 'role' || action === 'user') {
      const target = await resolveTarget(guild, args[2]);
      if (!target) {
        await message.reply({ embeds: [errorEmbed('حدد عضو أو رول.')] });
        return;
      }
      const roleIds = new Set(parseIds(existing?.allowedRoleIds));
      const userIds = new Set(parseIds(existing?.allowedUserIds));
      if (target.type === 'ROLE') roleIds.has(target.id) ? roleIds.delete(target.id) : roleIds.add(target.id);
      else userIds.has(target.id) ? userIds.delete(target.id) : userIds.add(target.id);
      const allowedRoleIds = JSON.stringify([...roleIds]);
      const allowedUserIds = JSON.stringify([...userIds]);
      await prisma.commandConfig.upsert({
        where: { guildId_commandName: { guildId: guild.id, commandName: command.name } },
        update: { allowedRoleIds, allowedUserIds },
        create: { guildId: guild.id, commandName: command.name, allowedRoleIds, allowedUserIds },
      });
      await message.reply({ embeds: [successEmbed(`تم تحديث صلاحيات ${command.name} لـ ${target.mention}.`)] });
      return;
    }
    await message.reply({
      embeds: [
        baseEmbed()
          .setTitle(`إعداد الأمر ${command.name}`)
          .setDescription(
            `الحالة: ${existing?.enabled === false ? 'مُعطّل' : 'مُفعّل'}\n` +
              `رولات مصرّحة: ${parseIds(existing?.allowedRoleIds).map((id) => `<@&${id}>`).join(' ') || 'لا يوجد'}\n` +
              `أعضاء مصرّحون: ${parseIds(existing?.allowedUserIds).map((id) => `<@${id}>`).join(' ') || 'لا يوجد'}`,
          ),
      ],
    });
  },
};

const settings: Command = {
  name: 'settings',
  description: 'Set server settings',
  category: 'vip',
  permission: 'admin',
  async execute({ message, guild }) {
    const cfg = await getGuildConfig(guild.id);
    await message.reply({
      embeds: [
        baseEmbed()
          .setTitle('إعدادات السيرفر')
          .setDescription(
            [
              `البرفكس: \`${cfg.prefix}\``,
              `الإعداد الأولي: ${statusDone(cfg.setupDone)}`,
              `وضع اللوقات: ${cfg.logMode}`,
              `فك العقوبة للمُعطي فقط: ${statusOnOff(cfg.punishOnlyAdmin)}`,
              `نظام new: ${cfg.newEnabled ? `مفعّل (${cfg.newMinAgeDays} يوم)` : 'معطّل'}`,
              `التفعيل: ${statusOnOff(cfg.verifyEnabled)}`,
              `رسالة الحظر: ${cfg.banMessage ?? 'افتراضية'}`,
            ].join('\n'),
          ),
      ],
    });
  },
};

const setbanmsg: Command = {
  name: 'setbanmsg',
  description: 'Set the ban message',
  category: 'vip',
  permission: 'admin',
  usage: '<text>',
  async execute({ message, guild, rest }) {
    await updateGuildConfig(guild.id, { banMessage: rest || null });
    await message.reply({ embeds: [successEmbed('تم ضبط رسالة الحظر.')] });
  },
};

const setchannel: Command = {
  name: 'setchannel',
  description: 'Set prison and new channel',
  category: 'vip',
  permission: 'admin',
  usage: '<new|verify> <#channel>',
  async execute({ message, guild, args }) {
    const type = args[0]?.toLowerCase();
    const channelId = args[1]?.replace(/\D/g, '') || message.channelId;
    if (type === 'new') {
      await updateGuildConfig(guild.id, { newChannelId: channelId });
      await message.reply({ embeds: [successEmbed(`تم ضبط قناة new على <#${channelId}>.`)] });
    } else if (type === 'verify') {
      await updateGuildConfig(guild.id, { verifyChannelId: channelId });
      const cfg = await getGuildConfig(guild.id);
      if (cfg.verifyEnabled && cfg.unverifiedRoleId) {
        const stats = await applyUnverifiedOverwritesToGuild(
          guild,
          cfg.unverifiedRoleId,
          channelId,
        );
        await message.reply({
          embeds: [
            successEmbed(
              `تم ضبط قناة التفعيل على <#${channelId}>.\nصلاحيات Unverified: ${formatVerifyOverwriteStats(stats)}.`,
            ),
          ],
        });
      } else {
        await message.reply({ embeds: [successEmbed(`تم ضبط قناة التفعيل على <#${channelId}>.`)] });
      }
    } else {
      await message.reply({ embeds: [errorEmbed('استخدم: setchannel <new|verify> <#قناة>.')] });
    }
  },
};

const setverify: Command = {
  name: 'setverify',
  description: 'Enable member verification gate',
  category: 'vip',
  permission: 'admin',
  async execute({ message, guild, config }) {
    if (!config.setupDone && !config.unverifiedRoleId) {
      await message.reply({ embeds: [errorEmbed('شغّل الإعداد الأولي (lsetup) أولاً.')] });
      return;
    }
    await guild.roles.fetch().catch(() => {});

    let unverifiedRoleId = config.unverifiedRoleId;
    if (!unverifiedRoleId) {
      const def = SYSTEM_ROLES.unverified;
      const existing = guild.roles.cache.find((r) => r.name === def.name);
      if (existing) {
        unverifiedRoleId = existing.id;
      } else {
        const role = await guild.roles.create({
          name: def.name,
          color: def.color,
          reason: 'SysBot verification',
        });
        unverifiedRoleId = role.id;
      }
    }

    let verifyChannelId =
      config.verifyChannelId ??
      (await ensureGateChannel(guild, VERIFY_CHANNEL_NAME, unverifiedRoleId));

    await updateGuildConfig(guild.id, {
      verifyEnabled: true,
      unverifiedRoleId,
      verifyChannelId,
    });

    const stats = await applyUnverifiedOverwritesToGuild(guild, unverifiedRoleId, verifyChannelId);
    await message.reply({
      embeds: [
        successEmbed(
          `تم تفعيل نظام التحقق.\nقناة التفعيل: <#${verifyChannelId}>\nصلاحيات القنوات: ${formatVerifyOverwriteStats(stats)}.`,
        ),
      ],
    });
  },
};

const unsetverify: Command = {
  name: 'unsetverify',
  description: 'Disable member verification gate',
  category: 'vip',
  permission: 'admin',
  async execute({ message, guild, config }) {
    if (!config.verifyEnabled) {
      await message.reply({ embeds: [errorEmbed('نظام التحقق غير مفعّل.')] });
      return;
    }
    await updateGuildConfig(guild.id, { verifyEnabled: false });
    let removed = 0;
    if (config.unverifiedRoleId) {
      removed = await removeUnverifiedOverwritesFromGuild(guild, config.unverifiedRoleId);
    }
    await message.reply({
      embeds: [
        successEmbed(
          `تم تعطيل نظام التحقق.${removed ? `\nأُزيلت صلاحيات Unverified من ${removed} قناة.` : ''}`,
        ),
      ],
    });
  },
};

const setpadmin: Command = {
  name: 'setpadmin',
  description: 'Set only admin remove the punishment',
  category: 'vip',
  permission: 'admin',
  async execute({ message, guild, config }) {
    await updateGuildConfig(guild.id, { punishOnlyAdmin: !config.punishOnlyAdmin });
    await message.reply({
      embeds: [successEmbed(`فك العقوبة للمُعطي فقط: ${statusOnOff(!config.punishOnlyAdmin)}`)],
    });
  },
};

const resons: Command = {
  name: 'resons',
  description: 'Manage punishment reason presets',
  category: 'vip',
  permission: 'admin',
  usage: 'add <مدة> <السبب> [mute prison vmute ban kick black] | remove <رقم|id> | edit <رقم> <مدة> <السبب> | list',
  async execute({ message, guild, args, rest }) {
    const typeMap: Record<string, PunishApplicableType> = {
      mute: 'MUTE',
      prison: 'PRISON',
      vmute: 'VMUTE',
      ban: 'BAN',
      kick: 'KICK',
      black: 'BLACKLIST',
    };

    const sub = args[0]?.toLowerCase();
    const reasons = await getPunishReasons(guild.id);

    if (sub === 'add') {
      const tail = rest.slice(args[0].length).trim();
      const parts = tail.split(/\s+/);
      const durationToken = parts[0];
      let parsedDuration: number | null;
      if (durationToken?.toLowerCase() === 'perm') {
        parsedDuration = null;
      } else {
        const durationMs = parseDuration(durationToken);
        if (durationMs === null) {
          await message.reply({
            embeds: [errorEmbed('صيغة المدة: 30m، 2h، 1d، أو perm للدائمة.')],
          });
          return;
        }
        parsedDuration = durationMs;
      }
      const typeMap: Record<string, PunishApplicableType> = {
        mute: 'MUTE',
        prison: 'PRISON',
        vmute: 'VMUTE',
        ban: 'BAN',
        kick: 'KICK',
        black: 'BLACKLIST',
      };
      const typeTokens: PunishApplicableType[] = [];
      const labelParts = parts.slice(1);
      while (labelParts.length && typeMap[labelParts[labelParts.length - 1].toLowerCase()]) {
        typeTokens.unshift(typeMap[labelParts.pop()!.toLowerCase()]);
      }
      const label = labelParts.join(' ').trim();
      if (!label) {
        await message.reply({ embeds: [errorEmbed('اكتب السبب بعد المدة.')] });
        return;
      }
      const types = typeTokens.length > 0 ? typeTokens : (['MUTE', 'PRISON', 'VMUTE'] as const);
      const id = `custom-${randomBytes(4).toString('hex')}`;
      await savePunishReasons(guild.id, [
        ...reasons,
        { id, label, durationMs: parsedDuration, types: [...types] },
      ]);
      await message.reply({ embeds: [successEmbed('تمت إضافة السبب.')] });
      return;
    }

    if (sub === 'remove') {
      const key = args[1];
      if (!key) {
        await message.reply({ embeds: [errorEmbed('حدد رقم السبب أو معرفه.')] });
        return;
      }
      const num = parseInt(key, 10);
      let next: typeof reasons;
      if (!Number.isNaN(num) && num >= 1 && num <= reasons.length) {
        next = reasons.filter((_, i) => i !== num - 1);
      } else {
        next = reasons.filter((r) => r.id !== key);
      }
      if (next.length === reasons.length) {
        await message.reply({ embeds: [errorEmbed('السبب غير موجود.')] });
        return;
      }
      await savePunishReasons(guild.id, next);
      await message.reply({ embeds: [successEmbed('تم حذف السبب.')] });
      return;
    }

    if (sub === 'edit') {
      const idx = parseInt(args[1] ?? '', 10) - 1;
      if (idx < 0 || idx >= reasons.length) {
        await message.reply({ embeds: [errorEmbed('رقم غير صحيح.')] });
        return;
      }
      const tail = rest.slice(args[0].length + (args[1]?.length ?? 0)).trim();
      const parts = tail.split(/\s+/);
      const durationToken = parts[0];
      const durationMs = parseDuration(durationToken);
      if (durationMs === null && durationToken?.toLowerCase() !== 'perm') {
        await message.reply({ embeds: [errorEmbed('صيغة المدة: 30m، 2h، 1d، أو perm.')] });
        return;
      }
      const label = parts.slice(1).join(' ').trim();
      if (!label) {
        await message.reply({ embeds: [errorEmbed('اكتب السبب بعد المدة.')] });
        return;
      }
      const updated = [...reasons];
      updated[idx] = {
        ...updated[idx],
        label,
        durationMs: durationToken?.toLowerCase() === 'perm' ? null : durationMs,
      };
      await savePunishReasons(guild.id, updated);
      await message.reply({ embeds: [successEmbed('تم تحديث السبب.')] });
      return;
    }

    const lines = reasons.map(
      (r, i) =>
        `${i + 1}. ${r.label} — ${formatDurationMs(r.durationMs)} (${r.types.join(', ')})`,
    );
    await message.reply({
      embeds: [
        baseEmbed()
          .setTitle('الأسباب الجاهزة')
          .setDescription(lines.join('\n') || 'لا يوجد'),
      ],
    });
  },
};

const pallow: Command = {
  name: 'pallow',
  description: 'Allow or deny admin from remove the punishment',
  category: 'vip',
  permission: 'admin',
  usage: '<@user>',
  async execute({ message, guild, args }) {
    const target = await resolveMember(guild, args[0]);
    if (!target) {
      await message.reply({ embeds: [errorEmbed('حدد عضو صحيح.')] });
      return;
    }
    const existing = await prisma.punishPerm.findUnique({
      where: { guildId_userId: { guildId: guild.id, userId: target.id } },
    });
    if (existing) {
      await prisma.punishPerm.delete({ where: { id: existing.id } });
      await message.reply({ embeds: [successEmbed(`تم منع ${target} من فك العقوبات.`)] });
    } else {
      await prisma.punishPerm.create({ data: { guildId: guild.id, userId: target.id } });
      await message.reply({ embeds: [successEmbed(`تم السماح لـ ${target} بفك العقوبات.`)] });
    }
  },
};

const plist: Command = {
  name: 'plist',
  description: 'Show punishment-permission list',
  category: 'vip',
  permission: 'mod',
  async execute({ message, guild }) {
    const perms = await prisma.punishPerm.findMany({ where: { guildId: guild.id } });
    await message.reply({
      embeds: [
        baseEmbed()
          .setTitle('المصرّح لهم بفك العقوبات')
          .setDescription(perms.map((p) => `<@${p.userId}>`).join('\n') || 'لا يوجد'),
      ],
    });
  },
};

function makePicMentionCommand(name: string, description: string, allow: boolean): Command {
  return {
    name,
    description,
    category: 'channels',
    permission: 'mod',
    async execute({ message, guild }) {
      const channel = message.channel;
      if (!('permissionOverwrites' in channel)) return;
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        AttachFiles: allow ? null : false,
        EmbedLinks: allow ? null : false,
      });
      await message.reply({
        embeds: [successEmbed(allow ? 'تم السماح بالصور والمنشن في هذا الشات.' : 'تم منع الصور والمنشن في هذا الشات.')],
      });
    },
  };
}

const applay = makePicMentionCommand('applay', 'Applay mentions and pic in chat', true);
const disapplay = makePicMentionCommand('disapplay', 'Disapplay mentions and pic in chat', false);

export const adminCommands: Command[] = [
  allow,
  deny,
  list,
  cmd,
  settings,
  setbanmsg,
  setchannel,
  setverify,
  unsetverify,
  setpadmin,
  resons,
  pallow,
  plist,
  applay,
  disapplay,
];
