import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';
import { logger } from '../logger.js';

function ensureSqliteDir(url: string): void {
  if (!url.startsWith('file:')) return;
  const raw = url.slice('file:'.length);
  const filePath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), 'prisma', raw);
  const dir = path.dirname(filePath);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

if (config.databaseUrl?.startsWith('file:')) {
  ensureSqliteDir(config.databaseUrl);
}

export const prisma = new PrismaClient();

export function databaseKind(): 'postgresql' | 'sqlite' | 'other' {
  const url = config.databaseUrl ?? '';
  if (url.startsWith('postgresql://') || url.startsWith('postgres://')) return 'postgresql';
  if (url.startsWith('file:')) return 'sqlite';
  return 'other';
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info({ kind: databaseKind() }, 'Connected to database');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
