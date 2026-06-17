import 'dotenv/config';
import path from 'node:path';

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

// Default the database to a local SQLite file (absolute path so the Prisma CLI
// and the runtime client resolve to the same location). On Railway set
// DATABASE_URL explicitly to a volume path, e.g. file:/data/sysbot.db
if (!process.env.DATABASE_URL) {
  const file = path.resolve(process.cwd(), 'data', 'sysbot.db');
  process.env.DATABASE_URL = `file:${file}`;
}

export const config = {
  token: required('DISCORD_TOKEN'),
  globalOwners: list('GLOBAL_OWNERS'),
  defaultPrefix: process.env.DEFAULT_PREFIX || '!',
  databaseUrl: process.env.DATABASE_URL,
  logLevel: process.env.LOG_LEVEL || 'info',
  logPretty: process.env.LOG_PRETTY === 'true',
} as const;
