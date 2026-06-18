import pino from 'pino';
import { config } from './config.js';

const onRailway = Boolean(
  process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID,
);

export const logger = pino({
  level: config.logLevel,
  transport:
    config.logPretty && !onRailway
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
});
