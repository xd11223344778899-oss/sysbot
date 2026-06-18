/**
 * Runs prisma migrate deploy; recovers from a failed init migration (P3009) on Railway.
 */
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const INIT_MIGRATION = '20250617120000_init_postgresql';

function run(cmd, inherit = true) {
  execSync(cmd, { stdio: inherit ? 'inherit' : 'pipe', encoding: 'utf8', env: process.env });
}

function deploySafe() {
  try {
    run('npx prisma migrate deploy', false);
    return { ok: true, out: '' };
  } catch (err) {
    const out = `${err.stdout ?? ''}\n${err.stderr ?? ''}\n${err.message ?? ''}`;
    return { ok: false, out };
  }
}

async function guildTableExists(prisma) {
  const rows = await prisma.$queryRaw`SELECT to_regclass('public."Guild"') AS name`;
  return Boolean(rows?.[0]?.name);
}

async function recover(prisma) {
  const exists = await guildTableExists(prisma);
  if (exists) {
    console.warn(`Marking ${INIT_MIGRATION} as applied (tables already exist).`);
    run(`npx prisma migrate resolve --applied ${INIT_MIGRATION}`);
    return;
  }

  console.warn(`Rolling back failed ${INIT_MIGRATION}, then re-applying.`);
  try {
    run(`npx prisma migrate resolve --rolled-back ${INIT_MIGRATION}`, false);
  } catch {
    // No failed row to resolve.
  }

  const retry = deploySafe();
  if (!retry.ok) {
    console.error(retry.out);
    process.exit(1);
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const first = deploySafe();
    if (first.ok) return;

    if (first.out.includes('P3009') && first.out.includes(INIT_MIGRATION)) {
      await recover(prisma);
      return;
    }

    console.error(first.out);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
