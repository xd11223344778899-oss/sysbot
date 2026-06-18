/**
 * Fails fast on Railway when DATABASE_URL points to localhost/SQLite or is missing.
 */
const url = process.env.DATABASE_URL?.trim() ?? '';
const onRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID,
);

if (!onRailway) {
  process.exit(0);
}

if (!url) {
  console.error(
    [
      'Railway: DATABASE_URL is not set on the bot service.',
      'Fix: Bot service → Variables → Add Reference → PostgreSQL → DATABASE_URL',
    ].join('\n'),
  );
  process.exit(1);
}

if (url.startsWith('file:') || /localhost|127\.0\.0\.1/.test(url)) {
  console.error(
    [
      'Railway: DATABASE_URL must point to Railway PostgreSQL, not SQLite or localhost.',
      `Current (truncated): ${url.slice(0, 60)}...`,
      'Fix: set DATABASE_URL=${{Postgres.DATABASE_URL}} on the bot service.',
    ].join('\n'),
  );
  process.exit(1);
}

if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
  console.error(`Railway: DATABASE_URL must start with postgresql://`);
  process.exit(1);
}
