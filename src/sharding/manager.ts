import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ShardingManager } from 'discord.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function startSharding(): Promise<void> {
  const botPath = path.join(__dirname, '..', 'bot.js');
  const totalShards = config.shardCount > 1 ? config.shardCount : 'auto';

  const manager = new ShardingManager(botPath, {
    token: config.token,
    totalShards,
    respawn: true,
  });

  manager.on('shardCreate', (shard) => {
    logger.info({ id: shard.id }, 'Shard launched');
    shard.on('death', () => logger.error({ id: shard.id }, 'Shard died'));
  });

  await manager.spawn();
  logger.info({ totalShards }, 'Sharding manager running');
}
