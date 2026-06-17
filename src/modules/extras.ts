import type { Command } from '../types/command.js';
import { successEmbed, errorEmbed, baseEmbed, statusOnOff } from '../shared/embeds.js';
import { resolveMember } from '../shared/resolvers.js';
import { prisma } from '../database/prisma.js';
import { updateGuildConfig } from '../database/guild-config.js';

function makeAutoToggle(
  name: string,
  description: string,
  key: 'autoLine' | 'autoClear' | 'autoReact',
  value: boolean,
): Command {
  return {
    name,
    description,
    category: 'utility',
    permission: 'admin',
    async execute({ message, guild, args }) {
      const data: Record<string, unknown> = { [key]: value };
      if (key === 'autoReact' && value && args[0]) data.reactEmoji = args[0];
      await updateGuildConfig(guild.id, data);
      await message.reply({ embeds: [successEmbed(`${name}: ${statusOnOff(value)}`)] });
    },
  };
}

const setline = makeAutoToggle('setline', 'Auto line in chat', 'autoLine', true);
const unline = makeAutoToggle('unline', 'Disable auto line in chat', 'autoLine', false);
const setclear = makeAutoToggle('setclear', 'Auto clear in chat', 'autoClear', true);
const unclear = makeAutoToggle('unclear', 'Disable auto clear in chat', 'autoClear', false);
const setreact = makeAutoToggle('setreact', 'Auto react in chat', 'autoReact', true);
const unreact = makeAutoToggle('unreact', 'Disable auto react in chat', 'autoReact', false);

const change: Command = {
  name: 'change',
  description: 'Change avatar to greyscale',
  category: 'utility',
  permission: 'everyone',
  usage: '[@user]',
  async execute({ message, guild, member, args }) {
    const target = (await resolveMember(guild, args[0])) ?? member;
    const url = target.user.displayAvatarURL({ extension: 'png', size: 512 });
    // Greyscale rendering is delegated to a public image filter proxy.
    const grey = `https://images.weserv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ''))}&filt=greyscale`;
    await message.reply({
      embeds: [baseEmbed().setTitle('أفاتار أبيض وأسود').setImage(grey)],
    });
  },
};

const restore: Command = {
  name: 'restore',
  description: 'Restore roles',
  category: 'utility',
  permission: 'admin',
  usage: '<@user>',
  async execute({ message, guild, args, config }) {
    const target = await resolveMember(guild, args[0]);
    if (!target) {
      await message.reply({ embeds: [errorEmbed('حدد عضو صحيح.')] });
      return;
    }
    const restored: string[] = [];
    if (config.autoRoleIds.length) {
      await target.roles.add(config.autoRoleIds).catch(() => {});
      restored.push('الرولات التلقائية');
    }
    const special = await prisma.specialRole.findUnique({
      where: { guildId_ownerId: { guildId: guild.id, ownerId: target.id } },
    });
    if (special && guild.roles.cache.has(special.roleId)) {
      await target.roles.add(special.roleId).catch(() => {});
      restored.push('الرول الخاص');
    }
    await message.reply({
      embeds: [successEmbed(`تم استرجاع: ${restored.join('، ') || 'لا شيء لاسترجاعه'}.`)],
    });
  },
};

const settask: Command = {
  name: 'settask',
  description: 'Set task for mods',
  category: 'utility',
  permission: 'admin',
  usage: '<@user> <task>',
  async execute({ message, guild, args, rest }) {
    const target = await resolveMember(guild, args[0]);
    const task = rest.slice(args[0]?.length ?? 0).trim();
    if (!target || !task) {
      await message.reply({ embeds: [errorEmbed('استخدم: settask <@عضو> <المهمة>.')] });
      return;
    }
    await prisma.modTask.create({ data: { guildId: guild.id, userId: target.id, task } });
    await message.reply({ embeds: [successEmbed(`تم تعيين مهمة لـ ${target}.`)] });
  },
};

const task: Command = {
  name: 'task',
  description: 'Get task for mods',
  category: 'utility',
  permission: 'mod',
  usage: '[@user]',
  async execute({ message, guild, member, args }) {
    const target = (await resolveMember(guild, args[0])) ?? member;
    const tasks = await prisma.modTask.findMany({
      where: { guildId: guild.id, userId: target.id },
      orderBy: { createdAt: 'desc' },
    });
    const lines = tasks.map((t) => `${t.done ? '[مكتمل]' : '[قيد التنفيذ]'} ${t.task}`);
    await message.reply({
      embeds: [baseEmbed().setTitle(`مهام ${target.user.username}`).setDescription(lines.join('\n') || 'لا توجد مهام')],
    });
  },
};

export const extraCommands: Command[] = [
  setline,
  unline,
  setclear,
  unclear,
  setreact,
  unreact,
  change,
  restore,
  settask,
  task,
];
