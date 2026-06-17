import type { GuildMember, VoiceState } from 'discord.js';
import { prisma } from '../database/prisma.js';
import { logger } from '../logger.js';

/** Skip re-mute briefly after the bot lifts a vmute. */
const recentlyLifted = new Map<string, number>();
const LIFT_GRACE_MS = 3000;

export function markVmuteLifted(userId: string): void {
  recentlyLifted.set(userId, Date.now());
  setTimeout(() => recentlyLifted.delete(userId), LIFT_GRACE_MS);
}

function wasRecentlyLifted(userId: string): boolean {
  const t = recentlyLifted.get(userId);
  if (!t) return false;
  return Date.now() - t < LIFT_GRACE_MS;
}

export async function hasActiveVmute(guildId: string, userId: string): Promise<boolean> {
  const row = await prisma.penalty.findFirst({
    where: { guildId, userId, type: 'VMUTE', active: true },
  });
  return Boolean(row);
}

/** Apply server mute if the member has an active VMUTE penalty. */
export async function enforceVmute(member: GuildMember): Promise<boolean> {
  const active = await hasActiveVmute(member.guild.id, member.id);
  if (!active) return false;
  if (!member.voice.channel) return false;
  if (member.voice.serverMute) return true;
  try {
    await member.voice.setMute(true, 'SysBot: عقوبة كتم صوتي نشطة');
    return true;
  } catch (err) {
    logger.warn({ err, userId: member.id }, 'enforceVmute failed');
    return false;
  }
}

/** Re-apply server mute when a punished member unmutes themselves or joins voice. */
export async function onVmuteVoiceUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;
  if (wasRecentlyLifted(member.id)) return;

  const active = await hasActiveVmute(newState.guild.id, member.id);
  if (!active) return;

  if (!newState.channelId) return;

  if (!newState.serverMute) {
    try {
      await member.voice.setMute(true, 'SysBot: إعادة كتم — العقوبة لا تزال نشطة');
    } catch (err) {
      logger.warn({ err, userId: member.id }, 'vmute re-apply failed');
    }
  }
}

/** On startup: re-apply server mute for active VMUTE penalties in voice. */
export async function recoverActiveVmutes(client: import('discord.js').Client): Promise<void> {
  const active = await prisma.penalty.findMany({
    where: { type: 'VMUTE', active: true },
  });
  for (const p of active) {
    const guild = await client.guilds.fetch(p.guildId).catch(() => null);
    if (!guild) continue;
    const member = await guild.members.fetch(p.userId).catch(() => null);
    if (member) await enforceVmute(member);
  }
  logger.info({ count: active.length }, 'VMUTE recovery complete');
}
