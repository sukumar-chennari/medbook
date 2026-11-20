import { Router } from 'express';

// A health check is a function that answers: "is this dependency working?"
export type HealthCheck = () => Promise<boolean>;
export type HealthChecks = Record<string, HealthCheck>;

const CHECK_TIMEOUT_MS = 2000;

async function runCheck(check: HealthCheck): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), CHECK_TIMEOUT_MS);
  });
  try {
    // Whichever finishes first wins: the real check, or the timeout (= "down").
    return await Promise.race([check().catch(() => false), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function healthRouter(checks: HealthChecks): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const names = Object.keys(checks);
    const results = await Promise.all(names.map((name) => runCheck(checks[name])));

    const dependencies: Record<string, 'up' | 'down'> = {};
    names.forEach((name, i) => {
      dependencies[name] = results[i] ? 'up' : 'down';
    });

    const healthy = results.every(Boolean);
    // 503 tells Docker, load balancers and uptime monitors "do not send traffic here".
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      dependencies,
    });
  });

  return router;
}
