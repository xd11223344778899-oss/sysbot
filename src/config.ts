import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function list(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Local dev fallback only — never on Railway (would mask a missing DATABASE_URL).
const onRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID,
);

if (!process.env.DATABASE_URL && !onRailway) {
  process.env.DATABASE_URL =
    'postgresql://sysbot:sysbot_local@localhost:5432/sysbot?schema=public';
}

if (onRailway) {
  const url = process.env.DATABASE_URL?.trim() ?? '';
  if (!url) {
    throw new Error(
      'Railway: DATABASE_URL is missing on the bot service. Link PostgreSQL (Add Reference → DATABASE_URL).',
    );
  }
  if (url.startsWith('file:') || /localhost|127\.0\.0\.1/.test(url)) {
    throw new Error(
      'Railway: DATABASE_URL must be Railway Postgres (${{Postgres.DATABASE_URL}}), not localhost or SQLite.',
    );
  }
  if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
    throw new Error('Railway: DATABASE_URL must be a postgresql:// connection string.');
  }
}

export const config = {
  token: required('DISCORD_TOKEN'),
  globalOwners: list('GLOBAL_OWNERS'),
  developerId: process.env.DEVELOPER_ID?.trim() ?? '',
  defaultPrefix: process.env.DEFAULT_PREFIX || '!',
  databaseUrl: process.env.DATABASE_URL,
  logLevel: process.env.LOG_LEVEL || 'info',
  logPretty: process.env.LOG_PRETTY === 'true',
  cmdRateLimitMax: intEnv('CMD_RATE_LIMIT_MAX', 3),
  cmdRateLimitWindowMs: intEnv('CMD_RATE_LIMIT_WINDOW_MS', 5000),
  /** 0/1 = single process; 2+ = ShardingManager (use BOT_SHARD_COUNT, not SHARD_COUNT). */
  shardCount: intEnv('BOT_SHARD_COUNT', intEnv('SHARD_COUNT', 0)),
} as const;

// discord.js reads process.env.SHARD_COUNT when creating Client; values < 2 crash startup.
if (config.shardCount < 2) {
  delete process.env.SHARD_COUNT;
}

export function isDeveloper(userId: string): boolean {
  return Boolean(config.developerId) && config.developerId === userId;
}
