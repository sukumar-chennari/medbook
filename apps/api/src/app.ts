import cors from 'cors';
import express, { type ErrorRequestHandler, type Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import type { Logger } from './lib/logger';
import { healthRouter, type HealthChecks } from './routes/health';

export interface AppDeps {
  logger: Logger;
  corsOrigin: string;
  healthChecks: HealthChecks;
}

// The app is built from "ingredients" passed in. Tests hand in fake ones,
// so they run without a real database.
export function createApp({ logger, corsOrigin, healthChecks }: AppDeps): Express {
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

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // Express 5 sends errors from async handlers here automatically.
  const onError: ErrorRequestHandler = (err, req, res, next) => {
    if (res.headersSent) return next(err);
    req.log.error({ err }, 'unhandled error');
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  };
  app.use(onError);

  return app;
}
