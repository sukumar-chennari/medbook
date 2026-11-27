import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import type { Logger } from './lib/logger';
import { errorHandler } from './middleware/error-handler';
import { createAuthRouter } from './routes/auth';
import { healthRouter, type HealthChecks } from './routes/health';
import type { AuthConfig } from './services/token.service';

export interface AppDeps {
  logger: Logger;
  corsOrigin: string;
  healthChecks: HealthChecks;
  auth: AuthConfig;
}

// The app is built from "ingredients" passed in. Tests hand in fake ones,
// so they run without a real database.
export function createApp({ logger, corsOrigin, healthChecks, auth }: AppDeps): Express {
  const app = express();

  app.use(helmet()); // safe default security headers
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/health' }, // keep health-check noise out
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.use('/health', healthRouter(healthChecks));
  app.use('/auth', createAuthRouter(auth));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.use(errorHandler); // must be last

  return app;
}
