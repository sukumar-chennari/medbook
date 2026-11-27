import jwt from 'jsonwebtoken';
import request from 'supertest';
import { RefreshToken } from '../src/models/refresh-token';
import { User } from '../src/models/user';
import { hashToken } from '../src/services/token.service';
import { testAuthConfig } from './helpers/config';
import { clearTestDb, DB_START_TIMEOUT_MS, startTestDb, stopTestDb } from './helpers/db';
import { buildApp, registerAndLogin, tokenFrom, withCookie } from './helpers/session';

const app = buildApp();

beforeAll(async () => {
  await startTestDb();
  await User.init();
  await RefreshToken.init();
}, DB_START_TIMEOUT_MS);

afterEach(clearTestDb);
afterAll(stopTestDb);

const refresh = (token: string) => withCookie(request(app).post('/auth/refresh'), token);
const logout = (token: string) => withCookie(request(app).post('/auth/logout'), token);

describe('POST /auth/refresh', () => {
  it('swaps the refresh token for a new access token and a NEW refresh token', async () => {
    const { refreshToken } = await registerAndLogin(app);

    const res = await refresh(refreshToken);

    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.accessToken, testAuthConfig.accessSecret, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
    expect(payload.sub).toBe(res.body.user.id);

    const newToken = tokenFrom(res);
    expect(newToken).toBeDefined();
    expect(newToken).not.toBe(refreshToken);
    expect(JSON.stringify(res.body)).not.toContain(newToken!);
  });

  it('crosses out the old token and keeps both in the same family', async () => {
    const { refreshToken } = await registerAndLogin(app);

    await refresh(refreshToken);

    const old = await RefreshToken.findOne({ tokenHash: hashToken(refreshToken) });
    const all = await RefreshToken.find();
    expect(old?.revokedAt).toBeDefined();
    expect(all).toHaveLength(2);
    expect(new Set(all.map((t) => t.family)).size).toBe(1);
    expect(all.filter((t) => !t.revokedAt)).toHaveLength(1);
  });

  it('can be repeated: each new token works once, in turn', async () => {
    let { refreshToken } = await registerAndLogin(app);

    for (let i = 0; i < 3; i++) {
      const res = await refresh(refreshToken);
      expect(res.status).toBe(200);
      refreshToken = tokenFrom(res)!;
    }
  });

  it('detects a reused token and cancels the whole family, including the newest token', async () => {
    const { refreshToken: stolen } = await registerAndLogin(app);
    const legit = await refresh(stolen); // the real user refreshes: "stolen" is now crossed out
    const newest = tokenFrom(legit)!;

    const thief = await refresh(stolen); // someone replays the old copy

    expect(thief.status).toBe(401);
    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(0);
    // The real user's newest token is dead too: they must log in again. Safe, and the thief is out.
    expect((await refresh(newest)).status).toBe(401);
  });

  it('lets only one of two simultaneous requests with the same token succeed', async () => {
    const { refreshToken } = await registerAndLogin(app);

    const results = await Promise.all([refresh(refreshToken), refresh(refreshToken)]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('returns 401 when there is no cookie', async () => {
    const res = await request(app).post('/auth/refresh');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_REFRESH_TOKEN');
  });

  it('returns 401 for a made-up token and creates nothing', async () => {
    await registerAndLogin(app);
    const before = await RefreshToken.countDocuments();

    const res = await refresh('this-token-was-never-issued');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(await RefreshToken.countDocuments()).toBe(before);
  });

  it('returns 401 for an expired token', async () => {
    const { refreshToken } = await registerAndLogin(app);
    await RefreshToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });

    expect((await refresh(refreshToken)).status).toBe(401);
  });

  it('tells the browser to delete the cookie when a refresh fails', async () => {
    const res = await refresh('this-token-was-never-issued');

    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(cookies.find((c) => c.startsWith('refresh_token=;'))).toMatch(
      /Expires=Thu, 01 Jan 1970/,
    );
  });

  it('picks up a role change at the next refresh', async () => {
    const { refreshToken } = await registerAndLogin(app);
    await User.updateOne({}, { role: 'doctor' });

    const res = await refresh(refreshToken);

    const payload = jwt.verify(res.body.accessToken, testAuthConfig.accessSecret) as jwt.JwtPayload;
    expect(payload.role).toBe('doctor');
  });

  it('rejects the refresh and cancels the family when the user no longer exists', async () => {
    const { refreshToken } = await registerAndLogin(app);
    await User.deleteMany({});

    expect((await refresh(refreshToken)).status).toBe(401);
    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(0);
  });
});

describe('POST /auth/logout', () => {
  it('cancels the refresh token, so it can no longer be used', async () => {
    const { refreshToken } = await registerAndLogin(app);

    const res = await logout(refreshToken);

    expect(res.status).toBe(204);
    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(0);
    expect((await refresh(refreshToken)).status).toBe(401);
  });

  it('tells the browser to delete the cookie', async () => {
    const { refreshToken } = await registerAndLogin(app);

    const res = await logout(refreshToken);

    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(cookies.find((c) => c.startsWith('refresh_token=;'))).toBeDefined();
  });

  it('cancels the newest token even after several refreshes', async () => {
    let { refreshToken } = await registerAndLogin(app);
    for (let i = 0; i < 2; i++) refreshToken = tokenFrom(await refresh(refreshToken))!;

    await logout(refreshToken);

    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(0);
  });

  it('succeeds quietly with no cookie or an unknown token, revealing nothing', async () => {
    expect((await request(app).post('/auth/logout')).status).toBe(204);
    expect((await logout('this-token-was-never-issued')).status).toBe(204);
  });
});
