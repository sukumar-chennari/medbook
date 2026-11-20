import { Redis } from 'ioredis';
import type { Logger } from './logger';

export function createRedis(url: string, logger: Logger): Redis {
  const redis = new Redis(url);
  // Without an 'error' listener, a Redis hiccup would crash the whole process.
  redis.on('error', (err) => logger.error({ err: err.message }, 'redis error'));
  return redis;
}

export async function pingRedis(redis: Redis): Promise<boolean> {
  try {
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  }
}
