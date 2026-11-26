import { createHash } from 'node:crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import pino from 'pino';
import request from 'supertest';
import { createApp } from '../src/app';
import { RefreshToken } from '../src/models/refresh-token';
import { User } from '../src/models/user';
import { testAuthConfig } from './helpers/config';
import { clearTestDb, DB_START_TIMEOUT_MS, startTestDb, stopTestDb } from './helpers/db';

function buildApp(secureCookies = false) {
  return createApp({
    logger: pino({ level: 'silent' }),
    corsOrigin: 'http://localhost:5173',
    healthChecks: {},
    auth: { ...testAuthConfig, secureCookies },
  });
}

const app = buildApp();

beforeAll(async () => {
  await startTestDb();
  await User.init();
  await RefreshToken.init();
}, DB_START_TIMEOUT_MS);

afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDb();
});
afterAll(stopTestDb);

const account = {
  name: 'Asha Patient',
  email: 'asha@example.com',
  password: 'correct-horse-battery',
};

beforeEach(async () => {
  await request(app).post('/auth/register').send(account);
});

// Reads the refresh_token cookie out of a response.
function refreshCookie(res: request.Response): string | undefined {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  return cookies.find((c) => c.startsWith('refresh_token='));
}

describe('POST /auth/login', () => {
  it('returns the user and an access token that proves who they are', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: account.email, password: account.password });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: account.email, role: 'patient' });

    // Check the token the way the server will later: signature, algorithm, and contents.
    const payload = jwt.verify(res.body.accessToken, testAuthConfig.accessSecret, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
    expect(payload.sub).toBe(res.body.user.id);
    expect(payload.role).toBe('patient');
    expect(payload.exp! - payload.iat!).toBe(15 * 60);
  });

  it('sends the refresh token only as an httpOnly cookie, never in the body', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: account.email, password: account.password });

    const cookie = refreshCookie(res);
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/auth/i);
    expect(cookie).not.toMatch(/Secure/i); // test config is not production

    const body = JSON.stringify(res.body);
    const tokenValue = cookie!.split(';')[0].split('=')[1];
    expect(body).not.toContain(tokenValue);
    expect(body).not.toMatch(/passwordHash|argon2/);
  });

  it('marks the cookie Secure when secureCookies is on (production)', async () => {
    const res = await request(buildApp(true))
      .post('/auth/login')
      .send({ email: account.email, password: account.password });

    expect(refreshCookie(res)).toMatch(/Secure/i);
  });

  it('stores only a hash of the refresh token in the database', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: account.email, password: account.password });

    const tokenValue = refreshCookie(res)!.split(';')[0].split('=')[1];
    const stored = await RefreshToken.find();

    expect(stored).toHaveLength(1);
    expect(stored[0].tokenHash).not.toBe(tokenValue);
    expect(stored[0].tokenHash).toBe(createHash('sha256').update(tokenValue).digest('hex'));
    expect(stored[0].expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
  });

  it('accepts the email in any letter case', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'ASHA@Example.com', password: account.password });

    expect(res.status).toBe(200);
  });

  it('gives the exact same 401 for a wrong password and an unknown email', async () => {
    const wrongPassword = await request(app)
      .post('/auth/login')
      .send({ email: account.email, password: 'not-the-password' });
    const unknownEmail = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: account.password });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('hands out no cookie and no token after a failed login', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: account.email, password: 'not-the-password' });

    expect(refreshCookie(res)).toBeUndefined();
    expect(res.body.accessToken).toBeUndefined();
    expect(await RefreshToken.countDocuments()).toBe(0);
  });

  it('still checks a password when the email is unknown, so timing does not leak accounts', async () => {
    const verify = jest.spyOn(argon2, 'verify');

    await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever-password' });

    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when the password is missing', async () => {
    const res = await request(app).post('/auth/login').send({ email: account.email });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('password');
  });
});
