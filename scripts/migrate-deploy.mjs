/**
 * Runs prisma migrate deploy; recovers from a failed init migration (P3009) on Railway.
 */
import { execSync } from 'node:child_process';

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

function runWithStdin(cmd, input) {
  execSync(cmd, {
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: process.env,
    input,
  });
}

function guildTableExists() {
  try {
    runWithStdin(
      'npx prisma db execute --stdin',
      "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='Guild' LIMIT 1;",
    );
    return true;
  } catch {
    return false;
  }
}

function recover() {
  console.warn(`Recovering from failed ${INIT_MIGRATION}...`);

  try {
    run(`npx prisma migrate resolve --rolled-back ${INIT_MIGRATION}`, false);
  } catch {
    // No failed row to resolve.
  }

  const retry = deploySafe();
  if (retry.ok) return;

  if (
    (retry.out.includes('already exists') || retry.out.includes('42P07')) &&
    guildTableExists()
  ) {
    console.warn(`Marking ${INIT_MIGRATION} as applied (schema present).`);
    run(`npx prisma migrate resolve --applied ${INIT_MIGRATION}`, false);
    return;
  }

  console.error(
    [
      'Database migration could not be completed.',
      retry.out,
      '',
      'Fix: Railway → Postgres → Data → Reset Database, then Redeploy the bot.',
    ].join('\n'),
  );
  process.exit(1);
}

function main() {
  const first = deploySafe();
  if (first.ok) {
    if (!guildTableExists()) {
      console.error('Migration reported success but Guild table is missing. Reset Postgres and redeploy.');
      process.exit(1);
    }
    return;
  }

  if (first.out.includes('P3009') && first.out.includes(INIT_MIGRATION)) {
    recover();
    if (!guildTableExists()) {
      console.error('Migration recovery finished but Guild table is missing. Reset Postgres and redeploy.');
      process.exit(1);
    }
    return;
  }

  console.error(first.out);
  process.exit(1);
}

main();
