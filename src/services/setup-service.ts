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
import { ensureRestrictedSetup } from './restricted-channels.js';
import {
  applyAllOverwritesToGuild,
  buildPermissionContext,
  formatPermStats,
  mergePermStats,
  type PermSyncStats,
} from './channel-permissions.js';
import { normalizeAllSystemRoles, type RoleNormalizeStats } from './system-role-permissions.js';
import { SYSTEM_ROLES, LOG_EVENTS, LOG_CATEGORIES } from '../shared/constants.js';
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
  permStats: PermSyncStats;
  roleNormalize: RoleNormalizeStats;
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

function eventCategoryKey(event: (typeof LOG_EVENTS)[number]): keyof typeof LOG_CATEGORIES {
  return event.category ?? 'logs';
}

function logChannelNameForEvent(event: (typeof LOG_EVENTS)[number], compact: boolean): string {
  if (!compact) return event.channelName;
  return `log-${event.group}`;
}

interface LogChannelEnsureResult {
  rows: { eventType: string; channelId: string }[];
  created: number;
  ok: number;
  categoriesCreated: number;
  categoriesOk: number;
}

/**
 * Ensures log channels exist. When reuseExisting is true, keeps DB / named channels
 * and only creates what is missing (sync mode).
 */
async function ensureLogChannels(
  guild: Guild,
  compact: boolean,
  reuseExisting: boolean,
): Promise<LogChannelEnsureResult> {
  const me = guild.members.me!;
  const rows: { eventType: string; channelId: string }[] = [];
  let created = 0;
  let ok = 0;
  let categoriesCreated = 0;
  let categoriesOk = 0;

  const categoryChannels = new Map<keyof typeof LOG_CATEGORIES, CategoryChannel>();
  const groupChannel = new Map<string, string>();
  const nameChannelInCategory = new Map<string, string>();

  const dbRows = reuseExisting
    ? await prisma.guildLogChannel.findMany({ where: { guildId: guild.id } })
    : [];
  const dbByEvent = new Map(dbRows.map((r) => [r.eventType, r.channelId]));

  if (reuseExisting) {
    for (const event of LOG_EVENTS) {
      const cid = dbByEvent.get(event.type);
      if (cid && guild.channels.cache.has(cid)) {
        groupChannel.set(`${eventCategoryKey(event)}:${event.group}`, cid);
        nameChannelInCategory.set(`${eventCategoryKey(event)}:${event.channelName}`, cid);
      }
    }
  }

  async function getCategory(key: keyof typeof LOG_CATEGORIES): Promise<CategoryChannel> {
    const cached = categoryChannels.get(key);
    if (cached) return cached;
    const name = LOG_CATEGORIES[key];
    const { category, created: catCreated } = await ensureCategory(guild, name);
    categoryChannels.set(key, category);
    if (catCreated) categoriesCreated += 1;
    else categoriesOk += 1;
    return category;
  }

  for (const event of LOG_EVENTS) {
    const catKey = eventCategoryKey(event);
    const parent = await getCategory(catKey);
    let channelId: string | undefined;

    if (reuseExisting) {
      const fromDb = dbByEvent.get(event.type);
      if (fromDb && guild.channels.cache.has(fromDb)) {
        channelId = fromDb;
        ok += 1;
      }
    }

    const channelName = logChannelNameForEvent(event, compact);
    const nameKey = `${catKey}:${channelName}`;

    if (!channelId && reuseExisting) {
      const byName = parent.children.cache.find((c) => c.name === channelName);
      if (byName) {
        channelId = byName.id;
        ok += 1;
        nameChannelInCategory.set(nameKey, byName.id);
        if (compact) groupChannel.set(`${catKey}:${event.group}`, byName.id);
      }
    }

    if (!channelId && !compact) {
      const shared = nameChannelInCategory.get(nameKey);
      if (shared && guild.channels.cache.has(shared)) {
        channelId = shared;
        ok += 1;
      }
    }

    if (!channelId && compact) {
      const grouped = groupChannel.get(`${catKey}:${event.group}`);
      if (grouped) {
        channelId = grouped;
        ok += 1;
      }
    }

    if (!channelId) {
      const ch = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: parent.id,
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
      nameChannelInCategory.set(nameKey, channelId);
      if (compact) groupChannel.set(`${catKey}:${event.group}`, channelId);
    }

    rows.push({ eventType: event.type, channelId });
  }

  return { rows, created, ok, categoriesCreated, categoriesOk };
}

async function persistSetup(
  guild: Guild,
  roleUpdates: Record<string, string>,
  logCategory: CategoryChannel,
  modCategory: CategoryChannel,
  logChannelRows: { eventType: string; channelId: string }[],
  restricted?: {
    restrictedCategoryId: string;
    blackChannelId: string;
    blackVoiceId: string;
    prisonChannelId: string;
    prisonVoiceId: string;
  },
): Promise<void> {
  await prisma.guild.update({
    where: { id: guild.id },
    data: {
      ...roleUpdates,
      setupDone: true,
      logCategory: logCategory.id,
      modCategory: modCategory.id,
      ...(restricted ?? {}),
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

  await normalizeAllSystemRoles(guild, roleUpdates);

  const { category: logCategory } = await ensureCategory(guild, LOG_CATEGORIES.logs);
  const { category: modCategory } = await ensureCategory(guild, LOG_CATEGORIES.mod);

  const cfg = await prisma.guild.findUnique({ where: { id: guild.id } });
  const compact = cfg?.logMode === 'COMPACT';
  const { rows: logChannelRows, created } = await ensureLogChannels(guild, compact, false);
  progress.logChannelsCreated = created;

  const blackId = roleUpdates[SYSTEM_ROLES.blacklisted.key];
  const prisonId = roleUpdates[SYSTEM_ROLES.prison.key];

  const restricted = await ensureRestrictedSetup(guild, blackId, prisonId);

  await persistSetup(guild, roleUpdates, logCategory, modCategory, logChannelRows, restricted);
  invalidateGuildConfig(guild.id);

  const permCtx = await buildPermissionContext(guild.id);
  const permStats = await applyAllOverwritesToGuild(guild, permCtx);
  progress.overwritesApplied = permStats.applied + permStats.fixed;

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
    permStats: { applied: 0, fixed: 0, unchanged: 0, skipped: 0 },
    roleNormalize: { everyoneFixed: false, rolesFixed: 0, rolesSkipped: 0 },
    punishReasonsSeeded: false,
  };

  const roleUpdates: Record<string, string> = {};
  for (const def of Object.values(SYSTEM_ROLES)) {
    const { role, created } = await ensureRole(guild, def.name, def.color);
    roleUpdates[def.key] = role.id;
    if (created) result.rolesCreated += 1;
    else result.rolesOk += 1;
  }

  result.roleNormalize = await normalizeAllSystemRoles(guild, roleUpdates);

  const { category: logCategory, created: logCatCreated } = await ensureCategory(
    guild,
    LOG_CATEGORIES.logs,
  );
  if (logCatCreated) result.categoriesCreated += 1;
  else result.categoriesOk += 1;

  const { category: modCategory, created: modCatCreated } = await ensureCategory(
    guild,
    LOG_CATEGORIES.mod,
  );
  if (modCatCreated) result.categoriesCreated += 1;
  else result.categoriesOk += 1;

  const cfg = await prisma.guild.findUnique({ where: { id: guild.id } });
  const compact = cfg?.logMode === 'COMPACT';
  const {
    rows: logChannelRows,
    created,
    ok,
    categoriesCreated: logCatsCreated,
    categoriesOk: logCatsOk,
  } = await ensureLogChannels(guild, compact, true);
  result.logChannelsCreated = created;
  result.logChannelsOk = ok;
  result.categoriesCreated += logCatsCreated;
  result.categoriesOk += logCatsOk;

  const blackId = roleUpdates[SYSTEM_ROLES.blacklisted.key];
  const prisonId = roleUpdates[SYSTEM_ROLES.prison.key];

  const restricted = await ensureRestrictedSetup(guild, blackId, prisonId);

  await persistSetup(guild, roleUpdates, logCategory, modCategory, logChannelRows, restricted);
  invalidateGuildConfig(guild.id);

  const permCtx = await buildPermissionContext(guild.id);
  const permStats = await applyAllOverwritesToGuild(guild, permCtx);
  mergePermStats(result.permStats, permStats);

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
  ];
  if (result.roleNormalize.everyoneFixed || result.roleNormalize.rolesFixed) {
    lines.push(
      `صلاحيات السيرفر: @everyone ${result.roleNormalize.everyoneFixed ? 'أُصلح' : 'سليم'}، ${result.roleNormalize.rolesFixed} رول أُعيد ضبطه`,
    );
  }
  lines.push(formatPermStats('صلاحيات القنوات (Muted/Prison/Black/Verify)', result.permStats));
  if (result.punishReasonsSeeded) {
    lines.push('تم زرع أسباب العقوبات الافتراضية.');
  }
  return lines.join('\n');
}
