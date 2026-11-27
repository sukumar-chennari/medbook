import pino from 'pino';
import request from 'supertest';
import { createApp } from '../../src/app';
import { testAuthConfig } from './config';

export const account = {
  name: 'Asha Patient',
  email: 'asha@example.com',
  password: 'correct-horse-battery',
};

export function buildApp() {
  return createApp({
    logger: pino({ level: 'silent' }),
    corsOrigin: 'http://localhost:5173',
    healthChecks: {},
    auth: testAuthConfig,
  });
}

// "refresh_token=abc; Path=/auth; HttpOnly; ..." -> "abc"
export function tokenFrom(res: request.Response): string | undefined {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const line = cookies.find((c) => c.startsWith('refresh_token='));
  return line?.split(';')[0].split('=')[1] || undefined;
}

// Sends a request the way a browser would: with the refresh cookie attached.
export function withCookie(req: request.Test, token: string) {
  return req.set('Cookie', `refresh_token=${token}`);
}

export async function registerAndLogin(app: ReturnType<typeof buildApp>) {
  await request(app).post('/auth/register').send(account);
  const res = await request(app)
    .post('/auth/login')
    .send({ email: account.email, password: account.password });
  return { refreshToken: tokenFrom(res)!, accessToken: res.body.accessToken as string };
}
