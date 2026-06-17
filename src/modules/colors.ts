import type { Command } from '../types/command.js';
import { successEmbed, errorEmbed, baseEmbed } from '../shared/embeds.js';
import { prisma } from '../database/prisma.js';
import { updateGuildConfig } from '../database/guild-config.js';

const PALETTE: Record<string, string> = {
  أحمر: '#e74c3c',
  أزرق: '#3498db',
  أخضر: '#2ecc71',
  أصفر: '#f1c40f',
  بنفسجي: '#9b59b6',
  وردي: '#e91e63',
  برتقالي: '#e67e22',
  سماوي: '#1abc9c',
  ذهبي: '#f39c12',
  أبيض: '#ffffff',
};

async function getOrCreatePersonalRole(guild: any, memberId: string) {
  const special = await prisma.specialRole.findUnique({
    where: { guildId_ownerId: { guildId: guild.id, ownerId: memberId } },
  });
  if (special) {
    const role = guild.roles.cache.get(special.roleId);
    if (role) return role;
  }
  const member = await guild.members.fetch(memberId);
  const role = await guild.roles.create({ name: member.user.username, reason: 'personal color' });
  await member.roles.add(role);
  await prisma.specialRole.upsert({
    where: { guildId_ownerId: { guildId: guild.id, ownerId: memberId } },
    update: { roleId: role.id },
    create: { guildId: guild.id, ownerId: memberId, roleId: role.id },
  });
  return role;
}

const color: Command = {
  name: 'color',
  description: 'Change your color',
  category: 'colors',
  permission: 'everyone',
  usage: '<#hex | اسم اللون>',
  async execute({ message, guild, member, args }) {
    const input = args[0];
    if (!input) {
      await message.reply({ embeds: [errorEmbed('اكتب لون: color #ff0000 أو color أحمر.')] });
      return;
    }
    const hex = PALETTE[input] ?? input;
    if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) {
      await message.reply({ embeds: [errorEmbed('لون غير صحيح.')] });
      return;
    }
    const role = await getOrCreatePersonalRole(guild, member.id);
    await role.setColor(`#${hex.replace('#', '')}` as `#${string}`);
    await message.reply({ embeds: [successEmbed('تم تغيير لونك.')] });
  },
};

const colors: Command = {
  name: 'colors',
  description: 'Get colors list',
  category: 'colors',
  permission: 'everyone',
  async execute({ message }) {
    const lines = Object.entries(PALETTE).map(([name, hex]) => `${name}: ${hex}`);
    await message.reply({ embeds: [baseEmbed().setTitle('الألوان المتاحة').setDescription(lines.join('\n'))] });
  },
};

const mcolors: Command = {
  name: 'mcolors',
  description: 'Get colors menu',
  category: 'colors',
  permission: 'everyone',
  async execute({ message }) {
    await message.reply({
      embeds: [
        baseEmbed()
          .setTitle('قائمة الألوان')
          .setDescription('اكتب `color <اسم اللون>` لاختيار لونك.\n' + Object.keys(PALETTE).map((c) => `- ${c}`).join('\n')),
      ],
    });
  },
};

const setcolors: Command = {
  name: 'setcolors',
  description: 'Set colors settings',
  category: 'colors',
  permission: 'admin',
  usage: '<json>',
  async execute({ message, guild, rest }) {
    let data: object = {};
    if (rest) {
      try {
        data = JSON.parse(rest);
      } catch {
        await message.reply({ embeds: [errorEmbed('صيغة JSON غير صحيحة.')] });
        return;
      }
    }
    const serialized = JSON.stringify(data);
    await prisma.antiCollection.upsert({
      where: { guildId_name: { guildId: guild.id, name: 'colors' } },
      update: { data: serialized },
      create: { guildId: guild.id, name: 'colors', data: serialized },
    });
    await message.reply({ embeds: [successEmbed('تم حفظ إعدادات الألوان.')] });
  },
};

const setpcolor: Command = {
  name: 'setpcolor',
  description: 'Set embed color',
  category: 'colors',
  permission: 'admin',
  usage: '<#hex>',
  async execute({ message, guild, args }) {
    const hex = args[0];
    if (!hex || !/^#?[0-9a-fA-F]{6}$/.test(hex)) {
      await message.reply({ embeds: [errorEmbed('حدد لون صحيح مثل #5865F2.')] });
      return;
    }
    await updateGuildConfig(guild.id, { embedColor: `#${hex.replace('#', '')}` });
    await message.reply({ embeds: [successEmbed('تم تغيير لون الإمبد الافتراضي.')] });
  },
};

const setpic: Command = {
  name: 'setpic',
  description: 'Embed pic in chat',
  category: 'colors',
  permission: 'admin',
  usage: '<url> (أو صورة مرفقة)',
  async execute({ message, guild, args }) {
    const url = message.attachments.first()?.url ?? args[0];
    if (!url) {
      await message.reply({ embeds: [errorEmbed('أرفق صورة أو رابط.')] });
      return;
    }
    await updateGuildConfig(guild.id, { embedPic: url });
    await message.reply({ embeds: [successEmbed('تم ضبط صورة الإمبد.')] });
  },
};

const unpic: Command = {
  name: 'unpic',
  description: 'Disable embed pic in chat',
  category: 'colors',
  permission: 'admin',
  async execute({ message, guild }) {
    await updateGuildConfig(guild.id, { embedPic: null });
    await message.reply({ embeds: [successEmbed('تم تعطيل صورة الإمبد.')] });
  },
};

export const colorCommands: Command[] = [color, colors, mcolors, setcolors, setpcolor, setpic, unpic];
