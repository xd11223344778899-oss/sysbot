import { ChannelType, PermissionFlagsBits } from 'discord.js';
import type { Command } from '../types/command.js';
import { successEmbed, errorEmbed, baseEmbed } from '../shared/embeds.js';
import { resolveMember, resolveRole } from '../shared/resolvers.js';
import { prisma } from '../database/prisma.js';
import { updateGuildConfig } from '../database/guild-config.js';
import { runRoleMulti, type RoleScope } from '../services/role-bulk.js';
import { tryRunHeavyJob, isHeavyJobRunning } from '../services/heavy-job-queue.js';
import { completeMemberVerification } from '../services/member-gate.js';
import { logModerationAction } from '../services/log-service.js';
import { openInteractiveRolePanel } from '../services/interactive-role-panel.js';
import { getGuildAdminRoleIds, openAdminRolePanel } from '../services/admin-role-panel.js';

const role: Command = {
  name: 'role',
  description: 'Add role to user',
  category: 'roles',
  permission: 'mod',
  usage: '<@user> <@role>',
  async execute({ message, guild, member, args }) {
    const target = await resolveMember(guild, args[0]);
    const r = resolveRole(guild, args[1]);
    if (!target || !r) {
      await message.reply({ embeds: [errorEmbed('استخدم: role <@عضو> <@رول>.')] });
      return;
    }
    if (target.roles.cache.has(r.id)) {
      await target.roles.remove(r);
      await message.reply({ embeds: [successEmbed(`تم سحب ${r} من ${target}.`)] });
      return;
    }
    const isOwner = member.id === guild.ownerId;
    if (!isOwner && r.position >= member.roles.highest.position) {
      await message.reply({
        embeds: [errorEmbed('لا يمكنك إعطاء رول أعلى من رولك أو مساوٍ له.')],
      });
      return;
    }
    if (r.permissions.has(PermissionFlagsBits.Administrator)) {
      await message.reply({ embeds: [errorEmbed('لا يمكنك إعطاء رول بصلاحية Administrator.')] });
      return;
    }
    const adminRoleIds = await getGuildAdminRoleIds(guild.id);
    if (adminRoleIds.has(r.id)) {
      await message.reply({ embeds: [errorEmbed('لا يمكنك إعطاء رول مسجّل كرول إداري.')] });
      return;
    }
    await target.roles.add(r);
    await message.reply({ embeds: [successEmbed(`تم إعطاء ${r} لـ ${target}.`)] });
  },
};

const rolemulti: Command = {
  name: 'rolemulti',
  description: 'Add role to all members',
  category: 'roles',
  permission: 'admin',
  usage: '<@role> [all|members|bots] [remove]',
  async execute({ message, guild, client, args }) {
    const r = resolveRole(guild, args[0]);
    if (!r) {
      await message.reply({ embeds: [errorEmbed('حدد رول صحيح.')] });
      return;
    }
    if (isHeavyJobRunning(guild.id)) {
      await message.reply({ embeds: [errorEmbed('توجد عملية ثقيلة قيد التنفيذ بالفعل.')] });
      return;
    }
    const scope = (['all', 'members', 'bots'].includes(args[1]) ? args[1] : 'all') as RoleScope;
    const remove = args.includes('remove');
    const status = await message.reply({
      embeds: [successEmbed(`بدأ ${remove ? 'سحب' : 'إعطاء'} ${r} لـ (${scope})، سيكتمل تدريجياً.`)],
    });
    const started = await tryRunHeavyJob(guild.id, async () => {
      const count = await runRoleMulti(client, { guildId: guild.id, roleId: r.id, scope, remove });
      await status
        .edit({ embeds: [successEmbed(`اكتمل ${remove ? 'السحب' : 'الإعطاء'} على ${count} عضو.`)] })
        .catch(() => {});
    });
    if (!started) {
      await status.edit({ embeds: [errorEmbed('توجد عملية ثقيلة قيد التنفيذ.')] }).catch(() => {});
    }
  },
};

const autorole: Command = {
  name: 'autorole',
  description: 'Add role to new members',
  category: 'roles',
  permission: 'admin',
  usage: '<@role>',
  async execute({ message, guild, args, config }) {
    const r = resolveRole(guild, args[0]);
    if (!r) {
      await message.reply({
        embeds: [
          baseEmbed()
            .setTitle('الرولات التلقائية الحالية')
            .setDescription(config.autoRoleIds.map((id) => `<@&${id}>`).join('\n') || 'لا يوجد'),
        ],
      });
      return;
    }
    const current = new Set(config.autoRoleIds);
    if (current.has(r.id)) current.delete(r.id);
    else current.add(r.id);
    await updateGuildConfig(guild.id, { autoRoleIds: [...current] });
    await message.reply({ embeds: [successEmbed(`تم تحديث الرولات التلقائية (${current.size}).`)] });
  },
};

const addrole: Command = {
  name: 'addrole',
  description: 'Create a new role',
  category: 'roles',
  permission: 'admin',
  usage: '<name>',
  async execute({ message, guild, rest }) {
    if (!rest) {
      await message.reply({ embeds: [errorEmbed('اكتب اسم الرول.')] });
      return;
    }
    const r = await guild.roles.create({ name: rest, reason: 'addrole' });
    await message.reply({ embeds: [successEmbed(`تم إنشاء ${r}.`)] });
  },
};

const srole: Command = {
  name: 'srole',
  description: 'Create a special role',
  category: 'roles',
  permission: 'mod',
  usage: '<@user> <name>',
  async execute({ message, guild, args, rest }) {
    const target = await resolveMember(guild, args[0]);
    const name = rest.slice(args[0]?.length ?? 0).trim();
    if (!target || !name) {
      await message.reply({ embeds: [errorEmbed('استخدم: srole <@عضو> <الاسم>.')] });
      return;
    }
    const r = await guild.roles.create({ name, reason: 'special role' });
    await target.roles.add(r);
    await prisma.specialRole.upsert({
      where: { guildId_ownerId: { guildId: guild.id, ownerId: target.id } },
      update: { roleId: r.id },
      create: { guildId: guild.id, ownerId: target.id, roleId: r.id },
    });
    await message.reply({ embeds: [successEmbed(`تم إنشاء رول خاص ${r} لـ ${target}.`)] });
  },
};

const dsrole: Command = {
  name: 'dsrole',
  description: 'Delete a special role',
  category: 'roles',
  permission: 'mod',
  usage: '<@user>',
  async execute({ message, guild, args }) {
    const target = await resolveMember(guild, args[0]);
    if (!target) {
      await message.reply({ embeds: [errorEmbed('حدد عضو صحيح.')] });
      return;
    }
    const special = await prisma.specialRole.findUnique({
      where: { guildId_ownerId: { guildId: guild.id, ownerId: target.id } },
    });
    if (!special) {
      await message.reply({ embeds: [errorEmbed('لا يوجد رول خاص لهذا العضو.')] });
      return;
    }
    await guild.roles.delete(special.roleId).catch(() => {});
    await prisma.specialRole.delete({ where: { id: special.id } });
    await message.reply({ embeds: [successEmbed('تم حذف الرول الخاص.')] });
  },
};

const myrole: Command = {
  name: 'myrole',
  description: 'Edit your special role',
  category: 'roles',
  permission: 'everyone',
  usage: '<name|color> <value>',
  async execute({ message, guild, member, args }) {
    const special = await prisma.specialRole.findUnique({
      where: { guildId_ownerId: { guildId: guild.id, ownerId: member.id } },
    });
    if (!special) {
      await message.reply({ embeds: [errorEmbed('ليس لديك رول خاص.')] });
      return;
    }
    const r = guild.roles.cache.get(special.roleId);
    if (!r) {
      await message.reply({ embeds: [errorEmbed('الرول الخاص غير موجود.')] });
      return;
    }
    const sub = args[0]?.toLowerCase();
    if (sub === 'color' && args[1]) {
      await r.setColor(args[1] as `#${string}`).catch(() => {});
      await message.reply({ embeds: [successEmbed('تم تغيير اللون.')] });
    } else if (sub === 'name') {
      await r.setName(args.slice(1).join(' ') || r.name);
      await message.reply({ embeds: [successEmbed('تم تغيير الاسم.')] });
    } else {
      await message.reply({ embeds: [errorEmbed('استخدم: myrole color #hex أو myrole name الاسم.')] });
    }
  },
};

function makeDecorRoleCommand(
  name: string,
  description: string,
  key: 'picRoleId' | 'hereRoleId' | 'liveRoleId',
): Command {
  return {
    name,
    description,
    category: 'roles',
    permission: 'mod',
    usage: '<@user>',
    async execute({ message, guild, args, config }) {
      const roleId = config[key];
      if (!roleId) {
        await message.reply({ embeds: [errorEmbed(`لم يتم ضبط الرول. استخدم setrole أولاً.`)] });
        return;
      }
      const target = await resolveMember(guild, args[0]);
      if (!target) {
        await message.reply({ embeds: [errorEmbed('حدد عضو صحيح.')] });
        return;
      }
      if (target.roles.cache.has(roleId)) {
        await target.roles.remove(roleId);
        await message.reply({ embeds: [successEmbed(`تم سحب الرول من ${target}.`)] });
      } else {
        await target.roles.add(roleId);
        await message.reply({ embeds: [successEmbed(`تم إعطاء الرول لـ ${target}.`)] });
      }
    },
  };
}

const pic = makeDecorRoleCommand('pic', 'Add pic role to user', 'picRoleId');
const here = makeDecorRoleCommand('here', 'Add here role to user', 'hereRoleId');
const live = makeDecorRoleCommand('live', 'Add live role to user', 'liveRoleId');

const setrole: Command = {
  name: 'setrole',
  description: 'Set pic , here , live roles',
  category: 'roles',
  permission: 'admin',
  usage: '<pic|here|live> <@role>',
  async execute({ message, guild, args }) {
    const type = args[0]?.toLowerCase();
    const r = resolveRole(guild, args[1]);
    const map: Record<string, 'picRoleId' | 'hereRoleId' | 'liveRoleId'> = {
      pic: 'picRoleId',
      here: 'hereRoleId',
      live: 'liveRoleId',
    };
    if (!type || !map[type] || !r) {
      await message.reply({ embeds: [errorEmbed('استخدم: setrole <pic|here|live> <@رول>.')] });
      return;
    }
    await updateGuildConfig(guild.id, { [map[type]]: r.id });
    await message.reply({ embeds: [successEmbed(`تم ضبط رول ${type} على ${r}.`)] });
  },
};

const irole: Command = {
  name: 'irole',
  description: 'Add or change role img',
  category: 'roles',
  permission: 'admin',
  usage: '<@role> (مع صورة مرفقة)',
  async execute({ message, guild, args }) {
    const r = resolveRole(guild, args[0]);
    const icon = message.attachments.first()?.url;
    if (!r || !icon) {
      await message.reply({ embeds: [errorEmbed('حدد رول وأرفق صورة.')] });
      return;
    }
    await r.setIcon(icon).then(
      () => message.reply({ embeds: [successEmbed('تم تحديث صورة الرول.')] }),
      () => message.reply({ embeds: [errorEmbed('السيرفر لا يدعم صور الرولات (يحتاج بوست).')] }),
    );
  },
};

const reactrole: Command = {
  name: 'reactrole',
  description: 'Make reaction role',
  category: 'roles',
  permission: 'admin',
  usage: '<messageId> <emoji> <@role>',
  async execute({ message, guild, args }) {
    const [msgId, emoji, roleToken] = args;
    const r = resolveRole(guild, roleToken);
    if (!msgId || !emoji || !r) {
      await message.reply({ embeds: [errorEmbed('استخدم: reactrole <معرف الرسالة> <إيموجي> <@رول>.')] });
      return;
    }
    const channel = message.channel;
    if (channel.type !== ChannelType.GuildText) return;
    const targetMsg = await channel.messages.fetch(msgId).catch(() => null);
    if (!targetMsg) {
      await message.reply({ embeds: [errorEmbed('لم أجد الرسالة في هذه القناة.')] });
      return;
    }
    const emojiKey = emoji.match(/\d{16,20}/)?.[0] ?? emoji;
    await targetMsg.react(emoji).catch(() => {});
    await prisma.reactionRole.upsert({
      where: { guildId_messageId_emoji: { guildId: guild.id, messageId: msgId, emoji: emojiKey } },
      update: { roleId: r.id },
      create: { guildId: guild.id, messageId: msgId, emoji: emojiKey, roleId: r.id },
    });
    await message.reply({ embeds: [successEmbed('تم إنشاء رول التفاعل.')] });
  },
};

const unnew: Command = {
  name: 'unnew',
  description: 'Remove new role from user',
  category: 'roles',
  permission: 'mod',
  usage: '<@user>',
  async execute({ message, guild, args, config }) {
    const target = await resolveMember(guild, args[0]);
    if (!target || !config.newRoleId) {
      await message.reply({ embeds: [errorEmbed('حدد عضو، وتأكد من ضبط رول new.')] });
      return;
    }
    await target.roles.remove(config.newRoleId).catch(() => {});
    await message.reply({ embeds: [successEmbed(`تم إزالة رول new عن ${target}.`)] });
  },
};

const verify: Command = {
  name: 'verify',
  description: 'Verify member — remove Unverified and apply auto-roles',
  category: 'roles',
  permission: 'mod',
  usage: '<@user>',
  async execute({ message, guild, member, args, config, client }) {
    const target = await resolveMember(guild, args[0]);
    if (!target) {
      await message.reply({ embeds: [errorEmbed('حدد العضو المراد تفعيله: verify <@عضو>.')] });
      return;
    }
    if (!config.unverifiedRoleId) {
      await message.reply({
        embeds: [errorEmbed('رول Unverified غير مضبوط. شغّل lsetup أو setverify أولاً.')],
      });
      return;
    }
    if (!target.roles.cache.has(config.unverifiedRoleId)) {
      await message.reply({
        embeds: [errorEmbed('هذا العضو لا يملك رول Unverified.')],
      });
      return;
    }

    const result = await completeMemberVerification(target, config);
    const autoroleLine = result.autorolesAdded.length
      ? `\nالرولات التلقائية: ${result.autorolesAdded.map((id) => `<@&${id}>`).join(' ')}`
      : '';

    await message.reply({
      embeds: [successEmbed(`تم تفعيل ${target}.${autoroleLine}`)],
    });

    void logModerationAction(client, guild.id, {
      title: 'تفعيل عضو',
      moderatorId: member.id,
      targetId: target.id,
      targetTag: target.user.tag,
      channelId: message.channelId,
      event: 'verify',
    });
  },
};

const verifyall: Command = {
  name: 'verifyall',
  description: 'Verify all unverified members at once',
  category: 'roles',
  permission: 'admin',
  async execute({ message, guild, config }) {
    if (!config.verifyEnabled || !config.unverifiedRoleId) {
      await message.reply({
        embeds: [errorEmbed('نظام التحقق غير مفعّل أو رول Unverified غير مضبوط.')],
      });
      return;
    }
    if (isHeavyJobRunning(guild.id)) {
      await message.reply({ embeds: [errorEmbed('توجد عملية ثقيلة قيد التنفيذ بالفعل.')] });
      return;
    }

    const status = await message.reply({
      embeds: [successEmbed('جارٍ تفعيل جميع الأعضاء غير المفعّلين...')],
    });

    const started = await tryRunHeavyJob(guild.id, async () => {
      await guild.members.fetch().catch(() => {});
      let count = 0;
      for (const member of guild.members.cache.values()) {
        if (member.user.bot) continue;
        if (!member.roles.cache.has(config.unverifiedRoleId!)) continue;
        await completeMemberVerification(member, config);
        count++;
      }
      await status
        .edit({ embeds: [successEmbed(`تم تفعيل ${count} عضو دفعة واحدة.`)] })
        .catch(() => {});
    });

    if (!started) {
      await status.edit({ embeds: [errorEmbed('توجد عملية ثقيلة قيد التنفيذ.')] }).catch(() => {});
    }
  },
};

const iroles: Command = {
  name: 'iroles',
  description: 'Open interactive roles configuration panel',
  category: 'roles',
  permission: 'admin',
  async execute({ message, guild, member }) {
    await openInteractiveRolePanel(message, guild, member.id);
  },
};

const aroles: Command = {
  name: 'aroles',
  description: 'Open admin roles configuration panel',
  category: 'roles',
  permission: 'admin',
  async execute({ message, guild, member }) {
    await openAdminRolePanel(message, guild, member.id);
  },
};

export const roleCommands: Command[] = [
  role,
  rolemulti,
  autorole,
  addrole,
  srole,
  dsrole,
  myrole,
  pic,
  here,
  live,
  setrole,
  irole,
  reactrole,
  unnew,
  verify,
  verifyall,
  iroles,
  aroles,
];
