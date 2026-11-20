import pino, { type Logger } from 'pino';

export type { Logger };

export function createLogger(level: string, nodeEnv: string): Logger {
  return pino({
    level,
    // Never let secrets reach the logs, even by accident.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.passwordHash',
      ],
      censor: '[redacted]',
    },
    // Pretty colours for humans in development; plain JSON everywhere else
    // (JSON is what log tools can search and filter).
    ...(nodeEnv === 'development' && {
      transport: { target: 'pino-pretty', options: { colorize: true } },
    }),
  });
}
