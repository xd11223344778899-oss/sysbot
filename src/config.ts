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

// Local dev fallback when DATABASE_URL is unset (matches docker-compose postgres service).
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://sysbot:sysbot_local@localhost:5432/sysbot?schema=public';
}

if (process.env.RAILWAY_ENVIRONMENT) {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
    throw new Error(
      'Railway: add a PostgreSQL service and link DATABASE_URL to the bot (SQLite is not supported).',
    );
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
  /** 0 = single process; >1 = manual shard count; "auto" handled in sharding manager */
  shardCount: intEnv('SHARD_COUNT', 0),
} as const;

export function isDeveloper(userId: string): boolean {
  return Boolean(config.developerId) && config.developerId === userId;
}
