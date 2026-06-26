import { EmbedBuilder } from 'discord.js';
import type { Command, CommandContext } from '../types/command.js';
import type { PenaltyType } from '../shared/enums.js';
import { successEmbed, errorEmbed, baseEmbed } from '../shared/embeds.js';
import { resolveMember, parseDuration, resolveRole } from '../shared/resolvers.js';
import { applyPenalty, liftPenalty, canLift, getUserPenalties } from '../services/penalty-service.js';
import { schedulePenaltyExpiry } from '../services/penalty-scheduler.js';
import {
  startPunishmentFlow,
  hasManualPunishArgs,
  type FlowPenaltyType,
} from '../services/punishment-flow.js';
import { enforceVmute } from '../services/vmute-guard.js';
import { logModerationAction } from '../services/log-service.js';
import { LOG_COLORS } from '../shared/log-embed.js';
import { prisma } from '../database/prisma.js';
import { canModerate } from '../services/mod-hierarchy.js';
import { encodeBlockReason } from '../services/block-service.js';
import { buildCrimesEmbed } from '../services/crime-records.js';
import { sendVmuteCommandLog } from '../services/voice-command-log.js';
import { PENALTY_TYPES } from '../shared/enums.js';

const PENALTY_LOG_TITLE: Partial<Record<PenaltyType, string>> = {
  MUTE: 'إسكات كتابي',
  PRISON: 'سجن',
  VMUTE: 'كتم صوتي',
  BAN: 'حظر',
  BLACKLIST: 'بلاك لست',
};

const LIFT_LOG_TITLE: Partial<Record<PenaltyType, string>> = {
  MUTE: 'فك إسكات',
  PRISON: 'فك سجن',
  VMUTE: 'فك كتم صوتي',
  BAN: 'فك حظر',
  BLACKLIST: 'فك بلاك لست',
};

async function resolveTargetAndReason(ctx: CommandContext) {
  const target = await resolveMember(ctx.guild, ctx.args[0], { punitive: true });
  let rest = ctx.rest;
  if (ctx.args[0]) rest = rest.slice(ctx.args[0].length).trim();
  let durationMs: number | null = null;
  const tokens = rest.split(/\s+/);
  if (tokens[0]) {
    const d = parseDuration(tokens[0]);
    if (d) {
      durationMs = d;
      rest = tokens.slice(1).join(' ');
    }
  }
  return { target, reason: rest || undefined, durationMs };
}

function makePenaltyCommand(
  name: string,
  type: PenaltyType,
  description: string,
  successMsg: string,
): Command {
  return {
    name,
    description,
    category: 'moderation',
    permission: 'mod',
    usage: '<@user> [duration] [reason]',
    async execute(ctx) {
      const { target, reason, durationMs } = await resolveTargetAndReason(ctx);
      if (!target) {
        await ctx.message.reply({ embeds: [errorEmbed('حدد عضو صحيح.')] });
        return;
      }
      if (!hasManualPunishArgs(ctx.rest, ctx.args[0])) {
        await startPunishmentFlow(ctx.message, type as FlowPenaltyType, target, ctx.member);
        return;
      }
      const expiresAt = durationMs ? new Date(Date.now() + durationMs) : null;
      try {
        const penalty = await applyPenalty({
          member: target,
          type,
          moderatorId: ctx.member.id,
          moderator: ctx.member,
          reason,
          expiresAt,
        });
        if (expiresAt) {
          schedulePenaltyExpiry(ctx.client, penalty.id, expiresAt);
        }
        const when = expiresAt ? ` لمدة <t:${Math.floor(expiresAt.getTime() / 1000)}:R>` : '';
        await ctx.message.reply({ embeds: [successEmbed(`${successMsg} ${target}${when}.`)] });
        void logModerationAction(ctx.client, ctx.guild.id, {
          title: PENALTY_LOG_TITLE[type] ?? type,
          moderatorId: ctx.member.id,
          targetId: target.id,
          targetTag: target.user.tag,
          reason,
          channelId: ctx.message.channelId,
          event: `تم تطبيق العقوبة${when}.`,
          color: LOG_COLORS.danger,
        });
        if (type === 'VMUTE') {
          void sendVmuteCommandLog(ctx.client, {
            moderator: ctx.member,
            target,
            kind: 'mute',
            reason,
            actionAt: expiresAt ?? penalty.createdAt,
          });
        }
      } catch (err) {
        const code = (err as Error).message;
        if (code === 'ROLE_NOT_CONFIGURED') {
          await ctx.message.reply({ embeds: [errorEmbed('شغّل الإعداد الأولي (lsetup) أولاً.')] });
        } else if (code === 'EXEMPT') {
          await ctx.message.reply({ embeds: [errorEmbed('هذا العضو لديه استثناء من هذه العقوبة.')] });
        } else if (code === 'VMUTE_FAILED') {
          await ctx.message.reply({ embeds: [errorEmbed('تعذّر تطبيق كتم الصوت. تحقق من صلاحيات البوت.')] });
        } else if (code.startsWith('HIERARCHY:')) {
          await ctx.message.reply({ embeds: [errorEmbed(code.slice('HIERARCHY:'.length))] });
        } else {
          await ctx.message.reply({ embeds: [errorEmbed('تعذّر تنفيذ العقوبة.')] });
        }
      }
    },
  };
}

function makeLiftCommand(name: string, type: PenaltyType, description: string, msg: string): Command {
  return {
    name,
    description,
    category: 'moderation',
    permission: 'mod',
    usage: '<@user>',
    async execute(ctx) {
      const target = await resolveMember(ctx.guild, ctx.args[0]);
      if (!target) {
        await ctx.message.reply({ embeds: [errorEmbed('حدد عضو صحيح.')] });
        return;
      }
      const active = await prisma.penalty.findFirst({
        where: { guildId: ctx.guild.id, userId: target.id, type, active: true },
        orderBy: { createdAt: 'desc' },
      });
      if (active && !(await canLift(ctx.guild.id, ctx.member.id, active.moderatorId))) {
        await ctx.message.reply({ embeds: [errorEmbed('فقط معطي العقوبة أو المصرّح له يمكنه فكها.')] });
        return;
      }
      const lifted = await liftPenalty(ctx.guild.id, target, type, ctx.member.id);
      if (lifted) {
        void logModerationAction(ctx.client, ctx.guild.id, {
          title: LIFT_LOG_TITLE[type] ?? `فك ${type}`,
          moderatorId: ctx.member.id,
          targetId: target.id,
          targetTag: target.user.tag,
          channelId: ctx.message.channelId,
          event: 'تم رفع العقوبة عن العضو.',
          color: LOG_COLORS.success,
        });
        if (type === 'VMUTE') {
          void sendVmuteCommandLog(ctx.client, {
            moderator: ctx.member,
            target,
            kind: 'unmute',
            actionAt: new Date(),
          });
        }
      }
      await ctx.message.reply({
        embeds: [lifted ? successEmbed(`${msg} ${target}.`) : errorEmbed('لا توجد عقوبة فعّالة.')],
      });
    },
  };
}

const mute = makePenaltyCommand(
  'mute',
  'MUTE',
  'Text mute — grants Muted role (blocks typing in all text channels)',
  'تم إسكات كتابي',
);
const prison = makePenaltyCommand('prison', 'PRISON', 'Prison user from typing in chat', 'تم سجن');
const vmute = makePenaltyCommand(
  'vmute',
  'VMUTE',
  'Voice mute — server mute in voice (no role)',
  'تم كتم صوت',
);
const unmute = makeLiftCommand('unmute', 'MUTE', 'Un mute user', 'تم فك إسكات');
const unprison = makeLiftCommand('unprison', 'PRISON', 'Un prison user', 'تم فك سجن');
const unvmute = makeLiftCommand('unvmute', 'VMUTE', 'Un vmute user', 'تم فك كتم صوت');

const ban: Command = {
  name: 'ban',
  description: 'Ban user from server',
  category: 'moderation',
  permission: 'admin',
  usage: '<@user> [reason]',
  async execute(ctx) {
    const target = await resolveMember(ctx.guild, ctx.args[0], { punitive: true });
    if (!target) {
      await ctx.message.reply({ embeds: [errorEmbed('حدد عضو صحيح (منشن أو معرف).')] });
      return;
    }
    const hierarchy = await canModerate(ctx.member, target);
    if (!hierarchy.allowed) {
      await ctx.message.reply({ embeds: [errorEmbed(hierarchy.reason ?? 'غير مسموح.')] });
      return;
    }
    if (!hasManualPunishArgs(ctx.rest, ctx.args[0])) {
      await startPunishmentFlow(ctx.message, 'BAN', target, ctx.member);
      return;
    }
    const reason = ctx.rest.slice(ctx.args[0]?.length ?? 0).trim() || ctx.config.banMessage || undefined;
    if (!target.bannable) {
      await ctx.message.reply({ embeds: [errorEmbed('لا أستطيع حظر هذا العضو.')] });
      return;
    }
    await target.ban({ reason });
    await prisma.penalty.create({
      data: { guildId: ctx.guild.id, userId: target.id, type: 'BAN', moderatorId: ctx.member.id, reason },
    });
    void logModerationAction(ctx.client, ctx.guild.id, {
      title: 'حظر',
      moderatorId: ctx.member.id,
      targetId: target.id,
      targetTag: target.user.tag,
      reason,
      channelId: ctx.message.channelId,
      event: 'تم حظر العضو من السيرفر.',
      color: LOG_COLORS.danger,
    });
    await ctx.message.reply({ embeds: [successEmbed(`تم حظر ${target.user.tag}.`)] });
  },
};

const unban: Command = {
  name: 'unban',
  description: 'Un ban user in server',
  category: 'moderation',
  permission: 'admin',
  usage: '<userId>',
  async execute(ctx) {
    const id = ctx.args[0]?.replace(/\D/g, '');
    if (!id) {
      await ctx.message.reply({ embeds: [errorEmbed('حدد معرف العضو.')] });
      return;
    }
    const active = await prisma.penalty.findFirst({
      where: { guildId: ctx.guild.id, userId: id, type: 'BAN', active: true },
      orderBy: { createdAt: 'desc' },
    });
    if (active && !(await canLift(ctx.guild.id, ctx.member.id, active.moderatorId))) {
      await ctx.message.reply({ embeds: [errorEmbed('فقط معطي العقوبة أو المصرّح له يمكنه فك الحظر.')] });
      return;
    }
    await ctx.guild.bans.remove(id).then(
      async () => {
        await prisma.penalty.updateMany({
          where: { guildId: ctx.guild.id, userId: id, type: 'BAN', active: true },
          data: { active: false, liftedAt: new Date(), liftedById: ctx.member.id },
        });
        void logModerationAction(ctx.client, ctx.guild.id, {
          title: 'فك حظر',
          moderatorId: ctx.member.id,
          targetId: id,
          channelId: ctx.message.channelId,
          event: 'تم فك حظر العضو.',
          color: LOG_COLORS.success,
        });
        await ctx.message.reply({ embeds: [successEmbed('تم فك الحظر.')] });
      },
      () => ctx.message.reply({ embeds: [errorEmbed('هذا العضو غير محظور.')] }),
    );
  },
};

const kick: Command = {
  name: 'kick',
  description: 'Kick user from server',
  category: 'moderation',
  permission: 'admin',
  usage: '<@user> [reason]',
  async execute(ctx) {
    const target = await resolveMember(ctx.guild, ctx.args[0], { punitive: true });
    if (!target) {
      await ctx.message.reply({ embeds: [errorEmbed('حدد عضو صحيح (منشن أو معرف).')] });
      return;
    }
    const hierarchy = await canModerate(ctx.member, target);
    if (!hierarchy.allowed) {
      await ctx.message.reply({ embeds: [errorEmbed(hierarchy.reason ?? 'غير مسموح.')] });
      return;
    }
    if (!hasManualPunishArgs(ctx.rest, ctx.args[0])) {
      await startPunishmentFlow(ctx.message, 'KICK', target, ctx.member);
      return;
    }
    if (!target.kickable) {
      await ctx.message.reply({ embeds: [errorEmbed('لا أستطيع طرد هذا العضو.')] });
      return;
    }
    const reason = ctx.rest.slice(ctx.args[0].length).trim() || undefined;
    await target.kick(reason);
    void logModerationAction(ctx.client, ctx.guild.id, {
      title: 'طرد',
      moderatorId: ctx.member.id,
      targetId: target.id,
      targetTag: target.user.tag,
      reason,
      channelId: ctx.message.channelId,
      event: 'تم طرد العضو من السيرفر.',
      color: LOG_COLORS.danger,
    });
    await ctx.message.reply({ embeds: [successEmbed(`تم طرد ${target.user.tag}.`)] });
  },
};

const vkick: Command = {
  name: 'vkick',
  description: 'Vkick user from voice',
  category: 'moderation',
  permission: 'mod',
  usage: '<@user>',
  async execute(ctx) {
    const target = await resolveMember(ctx.guild, ctx.args[0]);
    if (!target?.voice.channel) {
      await ctx.message.reply({ embeds: [errorEmbed('العضو ليس في روم صوتي.')] });
      return;
    }
    await target.voice.disconnect();
    await ctx.message.reply({ embeds: [successEmbed(`تم سحب ${target} من الصوت.`)] });
  },
};

const clear: Command = {
  name: 'clear',
  description: 'Clear messages from chat',
  category: 'moderation',
  permission: 'mod',
  usage: '<count>',
  async execute(ctx) {
    const count = Math.min(Math.max(parseInt(ctx.args[0] ?? '0', 10) || 0, 1), 100);
    if (!count || !ctx.message.channel.isTextBased() || !('bulkDelete' in ctx.message.channel)) {
      await ctx.message.reply({ embeds: [errorEmbed('حدد عدد الرسائل (1-100).')] });
      return;
    }
    const deleted = await ctx.message.channel.bulkDelete(count + 1, true).catch(() => null);
    const reply = await ctx.message.channel.send({
      embeds: [successEmbed(`تم حذف ${(deleted?.size ?? 1) - 1} رسالة.`)],
    });
    setTimeout(() => reply.delete().catch(() => {}), 4000);
  },
};

const warn: Command = {
  name: 'warn',
  description: 'Add warn to member',
  category: 'moderation',
  permission: 'mod',
  usage: '<@user> [reason]',
  async execute(ctx) {
    const target = await resolveMember(ctx.guild, ctx.args[0]);
    if (!target) {
      await ctx.message.reply({ embeds: [errorEmbed('حدد عضو صحيح.')] });
      return;
    }
    const reason = ctx.rest.slice(ctx.args[0].length).trim() || undefined;
    await prisma.warn.create({
      data: { guildId: ctx.guild.id, userId: target.id, moderatorId: ctx.member.id, reason },
    });
    const count = await prisma.warn.count({ where: { guildId: ctx.guild.id, userId: target.id } });
    await ctx.message.reply({ embeds: [successEmbed(`تم تحذير ${target} (إجمالي: ${count}).`)] });
  },
};

const wremove: Command = {
  name: 'wremove',
  description: 'Remove warn from member',
  category: 'moderation',
  permission: 'mod',
  usage: '<@user>',
  async execute(ctx) {
    const target = await resolveMember(ctx.guild, ctx.args[0]);
    if (!target) {
      await ctx.message.reply({ embeds: [errorEmbed('حدد عضو صحيح.')] });
      return;
    }
    const last = await prisma.warn.findFirst({
      where: { guildId: ctx.guild.id, userId: target.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!last) {
      await ctx.message.reply({ embeds: [errorEmbed('لا توجد تحذيرات.')] });
      return;
    }
    await prisma.warn.delete({ where: { id: last.id } });
    await ctx.message.reply({ embeds: [successEmbed('تم حذف آخر تحذير.')] });
  },
};

const wlist: Command = {
  name: 'wlist',
  description: 'Get warn list',
  category: 'moderation',
  permission: 'mod',
  usage: '<@user>',
  async execute(ctx) {
    const target = (await resolveMember(ctx.guild, ctx.args[0])) ?? ctx.member;
    const warns = await prisma.warn.findMany({
      where: { guildId: ctx.guild.id, userId: target.id },
      orderBy: { createdAt: 'desc' },
    });
    const lines = warns.map(
      (w, i) => `${i + 1}. ${w.reason ?? 'بدون سبب'} — <@${w.moderatorId}> <t:${Math.floor(w.createdAt.getTime() / 1000)}:R>`,
    );
    await ctx.message.reply({
      embeds: [baseEmbed().setTitle(`تحذيرات ${target.user.username}`).setDescription(lines.join('\n') || 'لا يوجد')],
    });
  },
};

function makePenaltyInfoCommand(name: string, type: PenaltyType, description: string): Command {
  return {
    name,
    description,
    category: 'moderation',
    permission: 'everyone',
    async execute(ctx) {
      const active = await prisma.penalty.findFirst({
        where: { guildId: ctx.guild.id, userId: ctx.member.id, type, active: true },
        orderBy: { createdAt: 'desc' },
      });
      if (!active) {
        await ctx.message.reply({ embeds: [baseEmbed().setDescription('لا توجد عقوبة فعّالة من هذا النوع.')] });
        return;
      }
      await ctx.message.reply({
        embeds: [
          baseEmbed()
            .setTitle(description)
            .addFields(
              { name: 'السبب', value: active.reason ?? 'بدون', inline: true },
              {
                name: 'تنتهي',
                value: active.expiresAt ? `<t:${Math.floor(active.expiresAt.getTime() / 1000)}:R>` : 'دائمة',
                inline: true,
              },
            ),
        ],
      });
    },
  };
}

const mymute = makePenaltyInfoCommand('mymute', 'MUTE', 'User text mute info');
const myprison = makePenaltyInfoCommand('myprison', 'PRISON', 'User prison info');
const myvmute = makePenaltyInfoCommand('myvmute', 'VMUTE', 'User voice mute info');

const mypenalties: Command = {
  name: 'mypenalties',
  description: 'User penalties',
  category: 'moderation',
  permission: 'everyone',
  async execute(ctx) {
    const penalties = await getUserPenalties(ctx.guild.id, ctx.member.id);
    const active = penalties.filter((p) => p.active);
    await ctx.message.reply({
      embeds: [
        baseEmbed()
          .setTitle('عقوباتك')
          .setDescription(
            active.map((p) => `- ${p.type}: ${p.reason ?? 'بدون سبب'}`).join('\n') || 'لا توجد عقوبات فعّالة',
          ),
      ],
    });
  },
};

const penalties: Command = {
  name: 'penalties',
  description: 'View user active penalties',
  category: 'moderation',
  permission: 'mod',
  usage: '<@user>',
  async execute(ctx) {
    const target = (await resolveMember(ctx.guild, ctx.args[0])) ?? ctx.member;
    const list = await getUserPenalties(ctx.guild.id, target.id);
    const active = list.filter((p) => p.active);
    await ctx.message.reply({
      embeds: [
        baseEmbed()
          .setTitle(`عقوبات ${target.user.username}`)
          .setDescription(
            active
              .map((p) => `- ${p.type}: ${p.reason ?? 'بدون'} — المعطي: <@${p.moderatorId}>`)
              .join('\n') || 'لا توجد عقوبات فعّالة',
          ),
      ],
    });
  },
};

const records: Command = {
  name: 'records',
  description: 'User full punishment record',
  aliases: ['crimes', 'fullrecord', 'سجلكامل'],
  category: 'moderation',
  permission: 'mod',
  usage: '<@user>',
  async execute(ctx) {
    const target = (await resolveMember(ctx.guild, ctx.args[0])) ?? ctx.member;
    const all = await getUserPenalties(ctx.guild.id, target.id);
    await ctx.message.reply({
      embeds: [buildCrimesEmbed(target.user.username, all)],
      allowedMentions: { users: all.map((p) => p.moderatorId) },
    });
  },
};

const pcontinue: Command = {
  name: 'pcontinue',
  description: 'Continuation of punishment',
  category: 'moderation',
  permission: 'mod',
  usage: '<@user> <type>',
  async execute(ctx) {
    const target = await resolveMember(ctx.guild, ctx.args[0], { punitive: true });
    const typeRaw = (ctx.args[1]?.toUpperCase() ?? 'MUTE') as PenaltyType;
    if (!target) {
      await ctx.message.reply({ embeds: [errorEmbed('حدد عضو صحيح.')] });
      return;
    }
    if (!PENALTY_TYPES.includes(typeRaw) || typeRaw === 'WARN' || typeRaw === 'BLOCK') {
      await ctx.message.reply({ embeds: [errorEmbed('نوع عقوبة غير صالح. استخدم: MUTE, PRISON, VMUTE.')] });
      return;
    }
    const active = await prisma.penalty.findFirst({
      where: { guildId: ctx.guild.id, userId: target.id, type: typeRaw, active: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!active) {
      await ctx.message.reply({ embeds: [errorEmbed('لا توجد عقوبة فعّالة من هذا النوع.')] });
      return;
    }
    if (typeRaw === 'VMUTE') {
      await enforceVmute(target).catch(() => {});
    } else if (typeRaw === 'MUTE' && ctx.config.mutedRoleId) {
      await target.roles.add(ctx.config.mutedRoleId).catch(() => {});
    } else if (typeRaw === 'PRISON' && ctx.config.prisonRoleId) {
      await target.roles.add(ctx.config.prisonRoleId).catch(() => {});
    }
    await ctx.message.reply({ embeds: [successEmbed(`تم استئناف عقوبة ${typeRaw} على ${target}.`)] });
  },
};

const exemption: Command = {
  name: 'exemption',
  description: 'Add an exemption to user',
  category: 'moderation',
  permission: 'admin',
  usage: '<@user> <type>',
  async execute(ctx) {
    const target = await resolveMember(ctx.guild, ctx.args[0]);
    const type = (ctx.args[1]?.toUpperCase() ?? 'MUTE') as PenaltyType;
    if (!target) {
      await ctx.message.reply({ embeds: [errorEmbed('حدد عضو صحيح.')] });
      return;
    }
    if (!PENALTY_TYPES.includes(type) || type === 'WARN') {
      await ctx.message.reply({ embeds: [errorEmbed('نوع استثناء غير صالح.')] });
      return;
    }
    await prisma.exemption.upsert({
      where: { guildId_userId_type: { guildId: ctx.guild.id, userId: target.id, type } },
      update: {},
      create: { guildId: ctx.guild.id, userId: target.id, type },
    });
    await ctx.message.reply({ embeds: [successEmbed(`تم استثناء ${target} من ${type}.`)] });
  },
};

const procedure: Command = {
  name: 'procedure',
  description: 'Remove an exemption from user',
  category: 'moderation',
  permission: 'admin',
  usage: '<@user> <type>',
  async execute(ctx) {
    const target = await resolveMember(ctx.guild, ctx.args[0]);
    const type = (ctx.args[1]?.toUpperCase() ?? 'MUTE') as PenaltyType;
    if (!target) {
      await ctx.message.reply({ embeds: [errorEmbed('حدد عضو صحيح.')] });
      return;
    }
    await prisma.exemption
      .delete({ where: { guildId_userId_type: { guildId: ctx.guild.id, userId: target.id, type } } })
      .catch(() => {});
    await ctx.message.reply({ embeds: [successEmbed(`تم إزالة استثناء ${target} من ${type}.`)] });
  },
};

const black = makePenaltyCommand('black', 'BLACKLIST', 'Blacklist user from server', 'تم إضافة للبلاك');

const block: Command = {
  name: 'block',
  description: 'Block user from receiving role(s) via role command',
  category: 'moderation',
  permission: 'admin',
  usage: '<@user> [@role] [reason]',
  async execute(ctx) {
    const target = await resolveMember(ctx.guild, ctx.args[0], { punitive: true });
    if (!target) {
      await ctx.message.reply({ embeds: [errorEmbed('حدد عضو صحيح (منشن أو معرف).')] });
      return;
    }
    const hierarchy = await canModerate(ctx.member, target);
    if (!hierarchy.allowed) {
      await ctx.message.reply({ embeds: [errorEmbed(hierarchy.reason ?? 'غير مسموح.')] });
      return;
    }
    const maybeRole = resolveRole(ctx.guild, ctx.args[1]);
    let userReason = ctx.rest.slice(ctx.args[0].length).trim();
    let blockedRole = maybeRole;
    if (!blockedRole && ctx.args[1] && !ctx.args[1].match(/<@&?\d+/)) {
      userReason = [ctx.args[1], ...ctx.args.slice(2)].join(' ').trim();
    } else if (blockedRole) {
      userReason = ctx.args.slice(2).join(' ').trim();
    }
    await prisma.penalty.create({
      data: {
        guildId: ctx.guild.id,
        userId: target.id,
        type: 'BLOCK',
        moderatorId: ctx.member.id,
        reason: encodeBlockReason(blockedRole?.id, userReason || undefined),
      },
    });
    const scope = blockedRole ? `من رول ${blockedRole}` : 'من جميع الرولات (عبر أمر role)';
    await ctx.message.reply({ embeds: [successEmbed(`تم حظر ${target} ${scope}.`)] });
  },
};

function makeUnlistCommand(name: string, type: PenaltyType, description: string, verb: string): Command {
  return {
    name,
    description,
    category: 'moderation',
    permission: 'admin',
    usage: '<@user|id>',
    async execute(ctx) {
      const member = await resolveMember(ctx.guild, ctx.args[0], { punitive: true });
      const id = member?.id ?? ctx.args[0]?.replace(/\D/g, '');
      if (!id) {
        await ctx.message.reply({ embeds: [errorEmbed('حدد العضو.')] });
        return;
      }
      const active = await prisma.penalty.findFirst({
        where: { guildId: ctx.guild.id, userId: id, type, active: true },
        orderBy: { createdAt: 'desc' },
      });
      if (active && !(await canLift(ctx.guild.id, ctx.member.id, active.moderatorId))) {
        await ctx.message.reply({ embeds: [errorEmbed('فقط معطي العقوبة أو المصرّح له يمكنه فكها.')] });
        return;
      }
      await prisma.penalty.updateMany({
        where: { guildId: ctx.guild.id, userId: id, type, active: true },
        data: { active: false, liftedAt: new Date(), liftedById: ctx.member.id },
      });
      await ctx.message.reply({ embeds: [successEmbed(`تم ${verb}.`)] });
    },
  };
}

const unblack = makeLiftCommand('unblack', 'BLACKLIST', 'Un blacklist user', 'تم فك البلاك');
const unblock = makeUnlistCommand('unblock', 'BLOCK', 'Un block user', 'فك الحظر من الرول');

export const moderationCommands: Command[] = [
  ban,
  unban,
  kick,
  vkick,
  clear,
  mute,
  unmute,
  prison,
  unprison,
  vmute,
  unvmute,
  warn,
  wremove,
  wlist,
  mymute,
  myprison,
  myvmute,
  mypenalties,
  penalties,
  records,
  pcontinue,
  exemption,
  procedure,
  black,
  unblack,
  block,
  unblock,
];
