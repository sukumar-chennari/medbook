import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { errorHandler } from '../src/middleware/error-handler';
import { authenticate } from '../src/middleware/authenticate';
import { requireRole } from '../src/middleware/require-role';
import { signAccessToken } from '../src/services/token.service';
import { testAuthConfig } from './helpers/config';

// A tiny app with one route per kind of door. No database needed: the guards only read the token.
const app = express();
app.get('/public', (_req, res) => void res.json({ ok: true }));
app.get('/private', authenticate(testAuthConfig), (req, res) => void res.json({ user: req.user }));
app.get('/admin', authenticate(testAuthConfig), requireRole('admin'), (_req, res) => {
  res.json({ ok: true });
});
app.get('/staff', authenticate(testAuthConfig), requireRole('doctor', 'admin'), (_req, res) => {
  res.json({ ok: true });
});
// A mistake on purpose: requireRole without authenticate in front of it.
app.get('/forgot-authenticate', requireRole('patient'), (_req, res) => void res.json({ ok: true }));
app.use(errorHandler);

const tokenFor = (role: string, id = 'user-1') => signAccessToken({ id, role }, testAuthConfig);
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const b64 = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');

describe('authenticate', () => {
  it('lets a valid token through and tells the route who the user is', async () => {
    const res = await request(app)
      .get('/private')
      .set(bearer(tokenFor('patient', 'abc123')));

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 'abc123', role: 'patient' });
  });

  it('does not touch public routes', async () => {
    expect((await request(app).get('/public')).status).toBe(200);
  });

  it('returns 401 NO_TOKEN when there is no Authorization header', async () => {
    const res = await request(app).get('/private');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_TOKEN');
  });

  it('returns 401 NO_TOKEN when the header is not a Bearer token', async () => {
    const res = await request(app).get('/private').set('Authorization', 'Basic dXNlcjpwYXNz');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_TOKEN');
  });

  it('returns 401 TOKEN_EXPIRED for an expired token, so the web app knows to refresh', async () => {
    const expired = jwt.sign({ role: 'patient' }, testAuthConfig.accessSecret, {
      subject: 'user-1',
      expiresIn: -10,
      algorithm: 'HS256',
    });

    const res = await request(app).get('/private').set(bearer(expired));

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects a token signed with a different secret (a forgery)', async () => {
    const forged = jwt.sign({ role: 'admin' }, 'an-attackers-own-secret-that-is-long-enough', {
      subject: 'user-1',
      expiresIn: 900,
      algorithm: 'HS256',
    });

    const res = await request(app).get('/admin').set(bearer(forged));

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects a token whose payload was edited to say "admin" (signature no longer matches)', async () => {
    const [header, , signature] = tokenFor('patient').split('.');
    const edited = [header, b64({ sub: 'user-1', role: 'admin', exp: 9999999999 }), signature];

    const res = await request(app)
      .get('/admin')
      .set(bearer(edited.join('.')));

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects an "alg: none" token that claims no signature is needed', async () => {
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'user-1', role: 'admin', exp: 9999999999 })}.`;

    const res = await request(app).get('/admin').set(bearer(none));

    expect(res.status).toBe(401);
  });

  it('rejects a token using a different algorithm, even with the right secret', async () => {
    const hs512 = jwt.sign({ role: 'admin' }, testAuthConfig.accessSecret, {
      subject: 'user-1',
      expiresIn: 900,
      algorithm: 'HS512',
    });

    const res = await request(app).get('/admin').set(bearer(hs512));

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects a correctly signed token that has an unknown role or no user id', async () => {
    const badRole = tokenFor('superhero');
    const noSubject = jwt.sign({ role: 'patient' }, testAuthConfig.accessSecret, {
      expiresIn: 900,
      algorithm: 'HS256',
    });

    expect((await request(app).get('/private').set(bearer(badRole))).status).toBe(401);
    expect((await request(app).get('/private').set(bearer(noSubject))).status).toBe(401);
  });

  it('rejects garbage', async () => {
    const res = await request(app).get('/private').set(bearer('not.a.token'));

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });
});

describe('requireRole', () => {
  it('lets the right role in', async () => {
    const res = await request(app)
      .get('/admin')
      .set(bearer(tokenFor('admin')));

    expect(res.status).toBe(200);
  });

  it('returns 403 (not 401) when the user is logged in but has the wrong role', async () => {
    const res = await request(app)
      .get('/admin')
      .set(bearer(tokenFor('patient')));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('accepts any of several allowed roles', async () => {
    expect(
      (
        await request(app)
          .get('/staff')
          .set(bearer(tokenFor('doctor')))
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get('/staff')
          .set(bearer(tokenFor('admin')))
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get('/staff')
          .set(bearer(tokenFor('patient')))
      ).status,
    ).toBe(403);
  });

  it('returns 401 when there is no token at all', async () => {
    expect((await request(app).get('/admin')).status).toBe(401);
  });

  it('fails closed if someone forgets to put authenticate in front of it', async () => {
    const res = await request(app).get('/forgot-authenticate');

    expect(res.status).toBe(401);
  });
});
