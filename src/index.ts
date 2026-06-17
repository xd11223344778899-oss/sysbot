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

async function main(): Promise<void> {
  await connectDatabase();

  const client = createClient();
  loadCommands();
  registerEvents(client);
  logger.info({ commands: registry.list().length }, 'Commands registered');

  client.once(Events.ClientReady, (c) => {
    logger.info({ tag: c.user.tag }, 'Bot is ready');
    c.user.setPresence({
      status: 'online',
      activities: [{ name: `${config.defaultPrefix}vip`, type: ActivityType.Listening }],
    });
    void recoverPenalties(client);
    void recoverActiveVmutes(client);
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

main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
