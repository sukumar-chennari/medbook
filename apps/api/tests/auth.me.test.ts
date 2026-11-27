import request from 'supertest';
import { RefreshToken } from '../src/models/refresh-token';
import { User } from '../src/models/user';
import { clearTestDb, DB_START_TIMEOUT_MS, startTestDb, stopTestDb } from './helpers/db';
import { account, buildApp, registerAndLogin } from './helpers/session';

const app = buildApp();

beforeAll(async () => {
  await startTestDb();
  await User.init();
  await RefreshToken.init();
}, DB_START_TIMEOUT_MS);

afterEach(clearTestDb);
afterAll(stopTestDb);

describe('GET /auth/me', () => {
  it('returns the logged-in user, using only the access token', async () => {
    const { accessToken } = await registerAndLogin(app);

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: account.email, role: 'patient' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
  });

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_TOKEN');
  });

  it('returns 401 if the account was deleted while the token was still valid', async () => {
    const { accessToken } = await registerAndLogin(app);
    await User.deleteMany({});

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('still works after logout, until the access token expires (documented limit)', async () => {
    const { accessToken, refreshToken } = await registerAndLogin(app);
    await request(app).post('/auth/logout').set('Cookie', `refresh_token=${refreshToken}`);

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
  });
});
