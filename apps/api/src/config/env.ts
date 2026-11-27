import { z } from 'zod';

// Every setting the API needs, with its type. If one is missing or wrong,
// the server refuses to start (fail fast) instead of crashing later in a confusing way.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MONGO_URI: z.string().min(1),
  REDIS_URL: z.string().min(1),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  // Secrets that sign tokens. Two different ones, at least 32 characters each.
  // If someone learns a secret they can forge tokens, so these never go in git.
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  // Access token: short life, so a stolen one stops working quickly.
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  // Refresh token: long life, used only to get a new access token.
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    // prettifyError lists the variable names and problems, never the values.
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
