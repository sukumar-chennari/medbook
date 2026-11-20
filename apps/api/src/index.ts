import { createApp } from './app';
import { loadEnv } from './config/env';
import { createLogger } from './lib/logger';
import { connectMongo, disconnectMongo, pingMongo } from './lib/mongo';
import { createRedis, pingRedis } from './lib/redis';

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL, env.NODE_ENV);

  await connectMongo(env.MONGO_URI);
  logger.info('mongo connected');
  const redis = createRedis(env.REDIS_URL, logger);

  const app = createApp({
    logger,
    corsOrigin: env.CORS_ORIGIN,
    healthChecks: { mongo: pingMongo, redis: () => pingRedis(redis) },
  });

  const server = app.listen(env.PORT, () => logger.info({ port: env.PORT }, 'api listening'));

  // Docker stops containers by sending SIGTERM. We finish current requests and
  // close connections cleanly instead of being killed mid-request.
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(async () => {
      await Promise.allSettled([disconnectMongo(), redis.quit()]);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref(); // safety net
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('fatal: failed to start api', err);
  process.exit(1);
});
