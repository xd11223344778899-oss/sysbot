import { ActivityType, Events } from 'discord.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { createClient } from './client.js';
import { connectDatabase, disconnectDatabase } from './database/prisma.js';
import { registerEvents } from './events/index.js';
import { loadCommands } from './modules/index.js';
import { registry } from './core/command-registry.js';
import { recoverPenalties } from './services/penalty-scheduler.js';
import { recoverActiveVmutes } from './services/vmute-guard.js';
import { loadStressStates } from './services/spam-intelligence.js';

export async function startBot(): Promise<void> {
  await connectDatabase();
  await loadStressStates();

  const client = createClient();
  loadCommands();
  registerEvents(client);
  logger.info({ commands: registry.list().length }, 'Commands registered');

  client.once(Events.ClientReady, (c) => {
    logger.info(
      {
        tag: c.user.tag,
        shard: c.shard?.ids,
        guilds: c.guilds.cache.size,
      },
      'Bot is ready',
    );
    c.user.setPresence({
      status: 'online',
      activities: [{ name: `${config.defaultPrefix}vip`, type: ActivityType.Listening }],
    });
    void recoverPenalties(client);
    void recoverActiveVmutes(client);

    if (!config.shardCount && c.guilds.cache.size >= 2400) {
      logger.warn(
        { guilds: c.guilds.cache.size },
        'Approaching Discord sharding threshold — set SHARD_COUNT',
      );
    }
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    await client.destroy();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await client.login(config.token);
}

const isShardWorker =
  process.argv[1]?.replace(/\\/g, '/').endsWith('/bot.js') ||
  process.argv[1]?.replace(/\\/g, '/').endsWith('/bot.ts');

if (isShardWorker) {
  startBot().catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('Fatal startup error:', message);
    if (stack) console.error(stack);
    logger.error({ err }, 'Fatal startup error');
    process.exit(1);
  });
}
