import pino from 'pino';
import request from 'supertest';
import { createApp } from '../src/app';
import type { HealthChecks } from '../src/routes/health';

function buildApp(healthChecks: HealthChecks) {
  return createApp({
    logger: pino({ level: 'silent' }),
    corsOrigin: 'http://localhost:5173',
    healthChecks,
  });
}

describe('GET /health', () => {
  it('returns 200 when every dependency is up', async () => {
    const app = buildApp({ mongo: async () => true, redis: async () => true });

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.dependencies).toEqual({ mongo: 'up', redis: 'up' });
  });

  it('returns 503 and names the dependency that is down', async () => {
    const app = buildApp({ mongo: async () => true, redis: async () => false });

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.dependencies).toEqual({ mongo: 'up', redis: 'down' });
  });

  it('treats a check that throws as down instead of crashing', async () => {
    const app = buildApp({
      mongo: async () => {
        throw new Error('boom');
      },
    });

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.dependencies.mongo).toBe('down');
  });
});

describe('unknown routes', () => {
  it('returns a JSON 404', async () => {
    const res = await request(buildApp({})).get('/nope');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
