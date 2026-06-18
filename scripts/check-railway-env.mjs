/**
 * Validates required env vars on Railway before starting the bot.
 */
const onRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID,
);

if (!onRailway) {
  process.exit(0);
}

const missing = [];
if (!process.env.DISCORD_TOKEN?.trim()) missing.push('DISCORD_TOKEN');

if (missing.length) {
  console.error(
    [
      'Railway: missing required variables on the bot service:',
      ...missing.map((v) => `  - ${v}`),
      '',
      'Add them under Bot service → Variables, then Redeploy.',
    ].join('\n'),
  );
  process.exit(1);
}

if (process.env.LOG_PRETTY === 'true') {
  console.warn('Railway: set LOG_PRETTY=false to avoid logging issues in production.');
}
