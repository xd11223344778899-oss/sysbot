import type { Command } from '../types/command.js';
import { successEmbed, errorEmbed, baseEmbed } from '../shared/embeds.js';
import { registry } from '../core/command-registry.js';
import { prisma } from '../database/prisma.js';
import {
  invalidateAliasCache,
  listAliasesForCommand,
  validateNewAlias,
} from '../services/alias-resolver.js';
import { getDefaultArabicAlias } from '../shared/default-command-aliases.ar.js';

function resolveCommandToken(token: string | undefined): Command | undefined {
  if (!token) return undefined;
  return registry.get(token);
}

const doadd: Command = {
  name: 'doadd',
  description: 'Add custom alias to a command',
  category: 'vip',
  permission: 'admin',
  usage: '<command> <alias>',
  async execute({ message, guild, args }) {
    const cmd = resolveCommandToken(args[0]);
    const alias = args[1];
    if (!cmd || !alias) {
      await message.reply({
        embeds: [errorEmbed('الاستخدام: doadd <الأمر> <الاسم البديل>')],
      });
      return;
    }
    const check = await validateNewAlias(guild.id, cmd.name, alias);
    if (!check.ok) {
      await message.reply({ embeds: [errorEmbed(check.reason)] });
      return;
    }
    await prisma.commandAlias.create({
      data: { guildId: guild.id, commandName: cmd.name, alias, isPrimary: false },
    });
    invalidateAliasCache(guild.id);
    await message.reply({
      embeds: [successEmbed(`تمت إضافة الاسم «${alias}» للأمر ${cmd.name}.`)],
    });
  },
};

const dochange: Command = {
  name: 'dochange',
  description: 'Change primary alias for a command',
  category: 'vip',
  permission: 'admin',
  usage: '<command> <alias>',
  async execute({ message, guild, args }) {
    const cmd = resolveCommandToken(args[0]);
    const alias = args[1];
    if (!cmd || !alias) {
      await message.reply({
        embeds: [errorEmbed('الاستخدام: dochange <الأمر> <الاسم البديل>')],
      });
      return;
    }
    const check = await validateNewAlias(guild.id, cmd.name, alias);
    if (!check.ok) {
      await message.reply({ embeds: [errorEmbed(check.reason)] });
      return;
    }
    await prisma.commandAlias.deleteMany({
      where: { guildId: guild.id, commandName: cmd.name, isPrimary: true },
    });
    await prisma.commandAlias.upsert({
      where: { guildId_alias: { guildId: guild.id, alias } },
      update: { commandName: cmd.name, isPrimary: true },
      create: { guildId: guild.id, commandName: cmd.name, alias, isPrimary: true },
    });
    invalidateAliasCache(guild.id);
    await message.reply({
      embeds: [successEmbed(`تم تغيير الاسم الرئيسي للأمر ${cmd.name} إلى «${alias}».`)],
    });
  },
};

const doremove: Command = {
  name: 'doremove',
  description: 'Remove custom alias from a command',
  category: 'vip',
  permission: 'admin',
  usage: '<command> <alias>',
  async execute({ message, guild, args }) {
    const cmd = resolveCommandToken(args[0]);
    const alias = args[1];
    if (!cmd || !alias) {
      await message.reply({
        embeds: [errorEmbed('الاستخدام: doremove <الأمر> <الاسم البديل>')],
      });
      return;
    }
    const deleted = await prisma.commandAlias.deleteMany({
      where: { guildId: guild.id, commandName: cmd.name, alias },
    });
    invalidateAliasCache(guild.id);
    if (!deleted.count) {
      await message.reply({ embeds: [errorEmbed('لم يُعثر على هذا الاسم المخصص.')] });
      return;
    }
    await message.reply({ embeds: [successEmbed(`تم حذف الاسم «${alias}».`)] });
  },
};

const dolist: Command = {
  name: 'dolist',
  description: 'List command aliases',
  category: 'vip',
  permission: 'admin',
  usage: '[command]',
  async execute({ message, guild, args }) {
    const cmd = args[0] ? resolveCommandToken(args[0]) : undefined;
    if (args[0] && !cmd) {
      await message.reply({ embeds: [errorEmbed('أمر غير معروف.')] });
      return;
    }
    if (cmd) {
      const info = await listAliasesForCommand(guild.id, cmd.name);
      const lines = [
        `الأمر الأساسي: ${cmd.name}`,
        `الاسم الرئيسي: ${info.primary ?? 'لا يوجد'}`,
        info.defaultPrimary ? `الافتراضي: ${info.defaultPrimary}` : '',
        info.extras.length ? `أسماء إضافية: ${info.extras.join('، ')}` : '',
      ].filter(Boolean);
      await message.reply({
        embeds: [baseEmbed().setTitle(`أسماء ${cmd.name}`).setDescription(lines.join('\n'))],
      });
      return;
    }
    const lines: string[] = [];
    for (const c of registry.list()) {
      const def = getDefaultArabicAlias(c.name);
      if (def) lines.push(`${c.name} — ${def}`);
    }
    await message.reply({
      embeds: [
        baseEmbed()
          .setTitle('الأسماء العربية الافتراضية')
          .setDescription(lines.join('\n').slice(0, 4000) || 'لا يوجد'),
      ],
    });
  },
};

export const aliasCommands: Command[] = [doadd, dochange, doremove, dolist];
