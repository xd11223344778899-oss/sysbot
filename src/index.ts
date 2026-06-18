import { config } from './config.js';
import { logger } from './logger.js';
import { startBot } from './bot.js';
import { startSharding } from './sharding/manager.js';

async function main(): Promise<void> {
  if (config.shardCount > 1) {
    await startSharding();
    return;
  }
  await startBot();
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error('Fatal startup error:', message);
  if (stack) console.error(stack);
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
