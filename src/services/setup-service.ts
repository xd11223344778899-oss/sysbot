import {
  ChannelType,
  PermissionFlagsBits,
  type CategoryChannel,
  type Guild,
  type Role,
} from 'discord.js';
import { prisma } from '../database/prisma.js';
import { invalidateGuildConfig } from '../database/guild-config.js';
import { ensureDefaultPunishReasons } from './punish-reasons-service.js';
import { parsePunishReasons } from '../shared/punish-reasons.js';
import { applyTextMuteOverwritesToGuild } from './text-mute-overwrites.js';
import { applyUnverifiedOverwritesToGuild } from './verify-overwrites.js';
import { SYSTEM_ROLES, LOG_EVENTS, CATEGORY_NAMES } from '../shared/constants.js';
import { logger } from '../logger.js';

export interface SetupProgress {
  rolesCreated: number;
  logChannelsCreated: number;
  overwritesApplied: number;
}

export interface SetupSyncResult {
  rolesCreated: number;
  rolesOk: number;
  categoriesCreated: number;
  categoriesOk: number;
  logChannelsCreated: number;
  logChannelsOk: number;
  muteOverwritesApplied: number;
  muteOverwritesFixed: number;
  muteOverwritesOk: number;
  verifyOverwritesApplied: number;
  verifyOverwritesFixed: number;
  verifyOverwritesOk: number;
  punishReasonsSeeded: boolean;
}

async function ensureRole(
  guild: Guild,
  name: string,
  color: number,
): Promise<{ role: Role; created: boolean }> {
  const existing = guild.roles.cache.find((r) => r.name === name);
  if (existing) return { role: existing, created: false };
  const role = await guild.roles.create({ name, color, reason: 'SysBot setup' });
  return { role, created: true };
}

async function ensureCategory(
  guild: Guild,
  name: string,
): Promise<{ category: CategoryChannel; created: boolean }> {
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === name,
  );
  if (existing) return { category: existing as CategoryChannel, created: false };
  const category = await guild.channels.create({ name, type: ChannelType.GuildCategory });
  return { category, created: true };
}

function logChannelNameForEvent(eventType: string, compact: boolean): string {
  const def = LOG_EVENTS.find((e) => e.type === eventType);
  if (!def) return `log-${eventType}`;
  return compact ? `log-${def.group}` : def.channelName;
}

interface LogChannelEnsureResult {
  rows: { eventType: string; channelId: string }[];
  created: number;
  ok: number;
}

/**
 * Ensures log channels exist. When reuseExisting is true, keeps DB / named channels
 * and only creates what is missing (sync mode).
 */
async function ensureLogChannels(
  guild: Guild,
  logCategory: CategoryChannel,
  compact: boolean,
  reuseExisting: boolean,
): Promise<LogChannelEnsureResult> {
  const me = guild.members.me!;
  const rows: { eventType: string; channelId: string }[] = [];
  let created = 0;
  let ok = 0;
  const groupChannel = new Map<string, string>();
  const dbRows = reuseExisting
    ? await prisma.guildLogChannel.findMany({ where: { guildId: guild.id } })
    : [];
  const dbByEvent = new Map(dbRows.map((r) => [r.eventType, r.channelId]));

  if (reuseExisting) {
    for (const event of LOG_EVENTS) {
      const cid = dbByEvent.get(event.type);
      if (cid && guild.channels.cache.has(cid)) {
        groupChannel.set(event.group, cid);
      }
    }
  }

  for (const event of LOG_EVENTS) {
    let channelId: string | undefined;

    if (reuseExisting) {
      const fromDb = dbByEvent.get(event.type);
      if (fromDb && guild.channels.cache.has(fromDb)) {
        channelId = fromDb;
        ok += 1;
      }
    }

    if (!channelId && reuseExisting) {
      const byName = logCategory.children.cache.find(
        (c) => c.name === logChannelNameForEvent(event.type, compact),
      );
      if (byName) {
        channelId = byName.id;
        ok += 1;
        if (compact) groupChannel.set(event.group, byName.id);
      }
    }

    if (!channelId && compact) {
      const grouped = groupChannel.get(event.group);
      if (grouped) {
        channelId = grouped;
        ok += 1;
      }
    }

    if (!channelId) {
      const ch = await guild.channels.create({
        name: logChannelNameForEvent(event.type, compact),
        type: ChannelType.GuildText,
        parent: logCategory.id,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          {
            id: me.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
          },
        ],
      });
      channelId = ch.id;
      created += 1;
      if (compact) groupChannel.set(event.group, channelId);
    }

    rows.push({ eventType: event.type, channelId });
  }

  return { rows, created, ok };
}

async function persistSetup(
  guild: Guild,
  roleUpdates: Record<string, string>,
  logCategory: CategoryChannel,
  modCategory: CategoryChannel,
  logChannelRows: { eventType: string; channelId: string }[],
): Promise<void> {
  await prisma.guild.update({
    where: { id: guild.id },
    data: {
      ...roleUpdates,
      setupDone: true,
      logCategory: logCategory.id,
      modCategory: modCategory.id,
    },
  });

  await prisma.$transaction(
    logChannelRows.map((row) =>
      prisma.guildLogChannel.upsert({
        where: { guildId_eventType: { guildId: guild.id, eventType: row.eventType } },
        update: { channelId: row.channelId },
        create: { guildId: guild.id, eventType: row.eventType, channelId: row.channelId },
      }),
    ),
  );

  invalidateGuildConfig(guild.id);
}

/**
 * Full setup — creates log channels every run (legacy). Prefer `runSetupSync` for re-runs.
 */
export async function runFullSetup(guild: Guild): Promise<SetupProgress> {
  const progress: SetupProgress = { rolesCreated: 0, logChannelsCreated: 0, overwritesApplied: 0 };

  const roleUpdates: Record<string, string> = {};
  for (const def of Object.values(SYSTEM_ROLES)) {
    const { role, created } = await ensureRole(guild, def.name, def.color);
    roleUpdates[def.key] = role.id;
    if (created) progress.rolesCreated += 1;
  }

  const { category: logCategory } = await ensureCategory(guild, CATEGORY_NAMES.logs);
  const { category: modCategory } = await ensureCategory(guild, CATEGORY_NAMES.mod);

  const cfg = await prisma.guild.findUnique({ where: { id: guild.id } });
  const compact = cfg?.logMode === 'COMPACT';
  const { rows: logChannelRows, created } = await ensureLogChannels(
    guild,
    logCategory,
    compact,
    false,
  );
  progress.logChannelsCreated = created;

  const mutedId = roleUpdates[SYSTEM_ROLES.muted.key];
  const muteStats = await applyTextMuteOverwritesToGuild(guild, mutedId, {
    logCategoryId: logCategory.id,
  });
  progress.overwritesApplied = muteStats.applied + muteStats.fixed;

  await persistSetup(guild, roleUpdates, logCategory, modCategory, logChannelRows);
  await ensureDefaultPunishReasons(guild.id);
  logger.info({ guild: guild.id, progress }, 'Full setup complete');
  return progress;
}

/**
 * Sync / repair — verifies missing pieces and fixes incorrect Muted-role overwrites
 * (e.g. Speak denied). Does not duplicate existing log channels.
 */
export async function runSetupSync(guild: Guild): Promise<SetupSyncResult> {
  await guild.channels.fetch().catch(() => {});
  await guild.roles.fetch().catch(() => {});

  const result: SetupSyncResult = {
    rolesCreated: 0,
    rolesOk: 0,
    categoriesCreated: 0,
    categoriesOk: 0,
    logChannelsCreated: 0,
    logChannelsOk: 0,
    muteOverwritesApplied: 0,
    muteOverwritesFixed: 0,
    muteOverwritesOk: 0,
    verifyOverwritesApplied: 0,
    verifyOverwritesFixed: 0,
    verifyOverwritesOk: 0,
    punishReasonsSeeded: false,
  };

  const roleUpdates: Record<string, string> = {};
  for (const def of Object.values(SYSTEM_ROLES)) {
    const { role, created } = await ensureRole(guild, def.name, def.color);
    roleUpdates[def.key] = role.id;
    if (created) result.rolesCreated += 1;
    else result.rolesOk += 1;
  }

  const { category: logCategory, created: logCatCreated } = await ensureCategory(
    guild,
    CATEGORY_NAMES.logs,
  );
  if (logCatCreated) result.categoriesCreated += 1;
  else result.categoriesOk += 1;

  const { category: modCategory, created: modCatCreated } = await ensureCategory(
    guild,
    CATEGORY_NAMES.mod,
  );
  if (modCatCreated) result.categoriesCreated += 1;
  else result.categoriesOk += 1;

  const cfg = await prisma.guild.findUnique({ where: { id: guild.id } });
  const compact = cfg?.logMode === 'COMPACT';
  const { rows: logChannelRows, created, ok } = await ensureLogChannels(
    guild,
    logCategory,
    compact,
    true,
  );
  result.logChannelsCreated = created;
  result.logChannelsOk = ok;

  const mutedId = roleUpdates[SYSTEM_ROLES.muted.key];
  const muteStats = await applyTextMuteOverwritesToGuild(guild, mutedId, {
    logCategoryId: logCategory.id,
  });
  result.muteOverwritesApplied = muteStats.applied;
  result.muteOverwritesFixed = muteStats.fixed;
  result.muteOverwritesOk = muteStats.unchanged;

  if (cfg?.verifyEnabled && cfg.verifyChannelId) {
    const unverifiedId = roleUpdates[SYSTEM_ROLES.unverified.key] ?? cfg.unverifiedRoleId;
    if (unverifiedId) {
      const verifyStats = await applyUnverifiedOverwritesToGuild(
        guild,
        unverifiedId,
        cfg.verifyChannelId,
      );
      result.verifyOverwritesApplied = verifyStats.applied;
      result.verifyOverwritesFixed = verifyStats.fixed;
      result.verifyOverwritesOk = verifyStats.unchanged;
    }
  }

  await persistSetup(guild, roleUpdates, logCategory, modCategory, logChannelRows);

  const beforeReasons = parsePunishReasons(cfg?.punishReasons);
  await ensureDefaultPunishReasons(guild.id);
  const afterCfg = await prisma.guild.findUnique({ where: { id: guild.id } });
  result.punishReasonsSeeded =
    !beforeReasons.length && parsePunishReasons(afterCfg?.punishReasons).length > 0;

  logger.info({ guild: guild.id, result }, 'Setup sync complete');
  return result;
}

/** Recreate / refresh only the log channels (lsetup). */
export async function setupLogs(guild: Guild): Promise<number> {
  const progress = await runFullSetup(guild);
  return progress.logChannelsCreated;
}

export function formatSetupSyncReport(result: SetupSyncResult): string {
  const lines = [
    'اكتمل التحقق والمزامنة.',
    '',
    `الرولات: ${result.rolesOk} سليمة` +
      (result.rolesCreated ? `، ${result.rolesCreated} أُنشئت` : ''),
    `الكاتيجوري: ${result.categoriesOk} سليمة` +
      (result.categoriesCreated ? `، ${result.categoriesCreated} أُنشئت` : ''),
    `قنوات اللوق: ${result.logChannelsOk} سليمة` +
      (result.logChannelsCreated ? `، ${result.logChannelsCreated} أُنشئت` : ''),
    `صلاحيات إسكات الكتابة (Muted): ${result.muteOverwritesOk} سليمة` +
      (result.muteOverwritesFixed
        ? `، ${result.muteOverwritesFixed} أُصلحت (إزالة Speak وغيرها)`
        : '') +
      (result.muteOverwritesApplied ? `، ${result.muteOverwritesApplied} أُضيفت` : ''),
  ];
  if (
    result.verifyOverwritesApplied ||
    result.verifyOverwritesFixed ||
    result.verifyOverwritesOk
  ) {
    lines.push(
      `صلاحيات التحقق (Unverified): ${result.verifyOverwritesOk} سليمة` +
        (result.verifyOverwritesFixed ? `، ${result.verifyOverwritesFixed} أُصلحت` : '') +
        (result.verifyOverwritesApplied ? `، ${result.verifyOverwritesApplied} أُضيفت` : ''),
    );
  }
  if (result.punishReasonsSeeded) {
    lines.push('تم زرع أسباب العقوبات الافتراضية.');
  }
  return lines.join('\n');
}
