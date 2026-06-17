import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';
import { logger } from '../logger.js';

// Ensure the SQLite directory exists before the client opens the file.
// Prisma resolves relative SQLite paths against the prisma/ schema folder, so
// we mirror that here (the process runs from the project root).
function ensureSqliteDir(url: string): void {
  if (!url.startsWith('file:')) return;
  const raw = url.slice('file:'.length);
  const filePath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), 'prisma', raw);
  const dir = path.dirname(filePath);
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureSqliteDir(config.databaseUrl);

export const prisma = new PrismaClient();

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('Connected to local database');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
