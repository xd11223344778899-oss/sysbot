import { EmbedBuilder, type ColorResolvable } from 'discord.js';

const COLORS = {
  success: 0x57f287,
  error: 0xed4245,
  info: 0x5865f2,
  warn: 0xfee75c,
} as const;

/** نص رسمي لحالة التفعيل/الإيقاف. */
export function statusOnOff(enabled: boolean): string {
  return enabled ? 'مفعّل' : 'معطّل';
}

/** نص رسمي لحالة الإعداد أو الإنجاز. */
export function statusDone(done: boolean): string {
  return done ? 'مكتمل' : 'غير مكتمل';
}

export function successEmbed(text: string): EmbedBuilder {
  return new EmbedBuilder().setColor(COLORS.success).setTitle('تم بنجاح').setDescription(text);
}

export function errorEmbed(text: string): EmbedBuilder {
  return new EmbedBuilder().setColor(COLORS.error).setTitle('خطأ').setDescription(text);
}

export function infoEmbed(text: string): EmbedBuilder {
  return new EmbedBuilder().setColor(COLORS.info).setTitle('معلومات').setDescription(text);
}

export function warnEmbed(text: string): EmbedBuilder {
  return new EmbedBuilder().setColor(COLORS.warn).setTitle('تنبيه').setDescription(text);
}

export function baseEmbed(color: ColorResolvable = COLORS.info): EmbedBuilder {
  return new EmbedBuilder().setColor(color);
}
