import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { writeFileSync } from 'node:fs';
import pino from 'pino';
import { z } from 'zod';

const env = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.string().default('info'),
    REDIS_URL: z.string().min(1),
  })
  .parse(process.env);

const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === 'development' && { transport: { target: 'pino-pretty' } }),
});

// BullMQ requires maxRetriesPerRequest to be null for its blocking Redis calls.
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
connection.on('error', (err) => logger.error({ err: err.message }, 'redis error'));

// TODO(Phase 4, you write this): the real reminder processor.
// For now it only proves the plumbing works: jobs put in the "reminders" queue get picked up.
const worker = new Worker(
  'reminders',
  async (job) => {
    logger.info({ jobId: job.id, name: job.name }, 'job received (placeholder processor)');
  },
  { connection },
);
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'job failed'));

// The worker has no web port, so Docker's health check reads this file instead.
// We refresh it only while Redis answers; if it goes stale, the container is "unhealthy".
const HEARTBEAT_FILE = '/tmp/worker-healthy';
const beat = async () => {
  try {
    if ((await connection.ping()) === 'PONG') writeFileSync(HEARTBEAT_FILE, String(Date.now()));
  } catch {
    // Redis is down: skip the heartbeat so the health check goes stale.
  }
};
void beat();
const heartbeat = setInterval(beat, 15_000);

logger.info('worker started, waiting for jobs');

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'worker shutting down');
  clearInterval(heartbeat);
  await worker.close(); // lets the current job finish first
  await connection.quit();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
