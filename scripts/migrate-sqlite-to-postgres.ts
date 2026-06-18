/**
 * One-time idempotent migration: SQLite file -> PostgreSQL (DATABASE_URL).
 * Usage: SQLITE_SOURCE_URL=file:../data/sysbot.db DATABASE_URL=postgresql://... npm run migrate:sqlite-to-pg
 */
import 'dotenv/config';
import path from 'node:path';
import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';

function resolveSqlitePath(url: string): string {
  const raw = url.startsWith('file:') ? url.slice('file:'.length) : url;
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(process.cwd(), 'prisma', raw);
}

const sqliteUrl = process.env.SQLITE_SOURCE_URL ?? 'file:../data/sysbot.db';
const pgUrl = process.env.DATABASE_URL;
if (!pgUrl?.startsWith('postgres')) {
  console.error('Set DATABASE_URL to a postgresql:// connection string.');
  process.exit(1);
}

const sqlitePath = resolveSqlitePath(sqliteUrl);
const db = new Database(sqlitePath, { readonly: true });
const prisma = new PrismaClient();

type Row = Record<string, unknown>;

function toBool(v: unknown): boolean {
  return v === true || v === 1 || v === '1';
}

const GUILD_BOOL_FIELDS = [
  'noPrefixMode',
  'setupDone',
  'decorBaselineEnabled',
  'newEnabled',
  'verifyEnabled',
  'antijoinEnabled',
  'punishOnlyAdmin',
  'antiDelete',
  'antiLinks',
  'antiPerms',
  'antiBots',
  'antiWord',
  'spamEnabled',
  'autoLine',
  'autoClear',
  'autoReact',
] as const;

function normalizeGuildRow(r: Row): Row {
  const out: Row = { ...r, id: String(r.id) };
  for (const key of GUILD_BOOL_FIELDS) {
    if (key in out) out[key] = toBool(out[key]);
  }
  if (out.createdAt) out.createdAt = new Date(String(out.createdAt));
  if (out.updatedAt) out.updatedAt = new Date(String(out.updatedAt));
  return out;
}

function rows(table: string): Row[] {
  try {
    return db.prepare(`SELECT * FROM "${table}"`).all() as Row[];
  } catch {
    return [];
  }
}

async function upsertGuild(r: Row): Promise<void> {
  const data = normalizeGuildRow(r);
  await prisma.guild.upsert({
    where: { id: String(data.id) },
    create: data as never,
    update: data as never,
  });
}

async function migrateTable(
  name: string,
  upsert: (r: Row) => Promise<void>,
): Promise<number> {
  const data = rows(name);
  let ok = 0;
  for (const row of data) {
    await upsert(row);
    ok += 1;
  }
  return ok;
}

async function main(): Promise<void> {
  console.log(`SQLite: ${sqlitePath}`);
  console.log(`Postgres: ${pgUrl.replace(/:[^:@]+@/, ':***@')}`);

  const report: Record<string, number> = {};

  report.Guild = await migrateTable('Guild', upsertGuild);

  const childUpserts: Array<[string, (r: Row) => Promise<void>]> = [
    [
      'GuildLogChannel',
      (r) =>
        prisma.guildLogChannel.upsert({
          where: { guildId_eventType: { guildId: String(r.guildId), eventType: String(r.eventType) } },
          create: { id: String(r.id), guildId: String(r.guildId), eventType: String(r.eventType), channelId: String(r.channelId) },
          update: { channelId: String(r.channelId) },
        }),
    ],
    [
      'BotOwner',
      (r) =>
        prisma.botOwner.upsert({
          where: { guildId_userId: { guildId: String(r.guildId), userId: String(r.userId) } },
          create: { id: String(r.id), guildId: String(r.guildId), userId: String(r.userId) },
          update: {},
        }),
    ],
    [
      'AccessEntry',
      (r) =>
        prisma.accessEntry.upsert({
          where: {
            guildId_targetId_mode: {
              guildId: String(r.guildId),
              targetId: String(r.targetId),
              mode: String(r.mode),
            },
          },
          create: r as never,
          update: r as never,
        }),
    ],
    [
      'CommandConfig',
      (r) =>
        prisma.commandConfig.upsert({
          where: {
            guildId_commandName: { guildId: String(r.guildId), commandName: String(r.commandName) },
          },
          create: { ...(r as object), enabled: toBool(r.enabled) } as never,
          update: { enabled: toBool(r.enabled), allowedRoleIds: String(r.allowedRoleIds), allowedUserIds: String(r.allowedUserIds) },
        }),
    ],
    [
      'Penalty',
      (r) =>
        prisma.penalty.upsert({
          where: { id: String(r.id) },
          create: {
            ...(r as object),
            active: toBool(r.active),
            expiresAt: r.expiresAt ? new Date(String(r.expiresAt)) : null,
            createdAt: new Date(String(r.createdAt)),
            liftedAt: r.liftedAt ? new Date(String(r.liftedAt)) : null,
          } as never,
          update: {} as never,
        }),
    ],
    [
      'Warn',
      (r) =>
        prisma.warn.upsert({
          where: { id: String(r.id) },
          create: { ...(r as object), createdAt: new Date(String(r.createdAt)) } as never,
          update: {},
        }),
    ],
    [
      'Point',
      (r) =>
        prisma.point.upsert({
          where: { guildId_userId: { guildId: String(r.guildId), userId: String(r.userId) } },
          create: r as never,
          update: { amount: Number(r.amount) },
        }),
    ],
    [
      'TrustEntry',
      (r) =>
        prisma.trustEntry.upsert({
          where: { guildId_userId: { guildId: String(r.guildId), userId: String(r.userId) } },
          create: r as never,
          update: {},
        }),
    ],
    [
      'BlacklistChat',
      (r) =>
        prisma.blacklistChat.upsert({
          where: { guildId_channelId: { guildId: String(r.guildId), channelId: String(r.channelId) } },
          create: r as never,
          update: {},
        }),
    ],
    [
      'ChannelDeny',
      (r) =>
        prisma.channelDeny.upsert({
          where: {
            guildId_channelId_userId: {
              guildId: String(r.guildId),
              channelId: String(r.channelId),
              userId: String(r.userId),
            },
          },
          create: r as never,
          update: {},
        }),
    ],
    [
      'SpecialRole',
      (r) =>
        prisma.specialRole.upsert({
          where: { guildId_ownerId: { guildId: String(r.guildId), ownerId: String(r.ownerId) } },
          create: r as never,
          update: { roleId: String(r.roleId) },
        }),
    ],
    [
      'ReactionRole',
      (r) =>
        prisma.reactionRole.upsert({
          where: {
            guildId_messageId_emoji: {
              guildId: String(r.guildId),
              messageId: String(r.messageId),
              emoji: String(r.emoji),
            },
          },
          create: r as never,
          update: { roleId: String(r.roleId) },
        }),
    ],
    [
      'ModTask',
      (r) =>
        prisma.modTask.upsert({
          where: { id: String(r.id) },
          create: {
            ...(r as object),
            done: toBool(r.done),
            createdAt: new Date(String(r.createdAt)),
          } as never,
          update: {},
        }),
    ],
    [
      'Exemption',
      (r) =>
        prisma.exemption.upsert({
          where: {
            guildId_userId_type: {
              guildId: String(r.guildId),
              userId: String(r.userId),
              type: String(r.type),
            },
          },
          create: r as never,
          update: {},
        }),
    ],
    [
      'PunishPerm',
      (r) =>
        prisma.punishPerm.upsert({
          where: { guildId_userId: { guildId: String(r.guildId), userId: String(r.userId) } },
          create: r as never,
          update: {},
        }),
    ],
    [
      'CommandAlias',
      (r) =>
        prisma.commandAlias.upsert({
          where: { guildId_alias: { guildId: String(r.guildId), alias: String(r.alias) } },
          create: { ...(r as object), isPrimary: toBool(r.isPrimary) } as never,
          update: { ...(r as object), isPrimary: toBool(r.isPrimary) } as never,
        }),
    ],
    [
      'AntiCollection',
      (r) =>
        prisma.antiCollection.upsert({
          where: { guildId_name: { guildId: String(r.guildId), name: String(r.name) } },
          create: r as never,
          update: { data: String(r.data) },
        }),
    ],
    [
      'InteractiveRole',
      (r) =>
        prisma.interactiveRole.upsert({
          where: { guildId_roleId: { guildId: String(r.guildId), roleId: String(r.roleId) } },
          create: {
            ...(r as object),
            attachFiles: toBool(r.attachFiles),
            mentionEveryone: toBool(r.mentionEveryone),
            stream: toBool(r.stream),
            muteMembers: toBool(r.muteMembers),
            deafenMembers: toBool(r.deafenMembers),
          } as never,
          update: {
            attachFiles: toBool(r.attachFiles),
            mentionEveryone: toBool(r.mentionEveryone),
            stream: toBool(r.stream),
            muteMembers: toBool(r.muteMembers),
            deafenMembers: toBool(r.deafenMembers),
            allowedCommands: String(r.allowedCommands),
            sortOrder: Number(r.sortOrder),
          },
        }),
    ],
  ];

  for (const [table, upsert] of childUpserts) {
    report[table] = await migrateTable(table, upsert);
  }

  console.log('Migration report (rows upserted):');
  for (const [k, v] of Object.entries(report)) {
    console.log(`  ${k}: ${v}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    db.close();
    await prisma.$disconnect();
  });
