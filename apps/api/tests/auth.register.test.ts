import argon2 from 'argon2';
import pino from 'pino';
import request from 'supertest';
import { createApp } from '../src/app';
import { User } from '../src/models/user';
import { testAuthConfig } from './helpers/config';
import { clearTestDb, DB_START_TIMEOUT_MS, startTestDb, stopTestDb } from './helpers/db';

const app = createApp({
  logger: pino({ level: 'silent' }),
  corsOrigin: 'http://localhost:5173',
  healthChecks: {},
  auth: testAuthConfig,
});

beforeAll(async () => {
  await startTestDb();
  await User.init(); // make sure the unique email index exists
}, DB_START_TIMEOUT_MS);

afterEach(clearTestDb);
afterAll(stopTestDb);

const valid = {
  name: 'Asha Patient',
  email: 'asha@example.com',
  password: 'correct-horse-battery',
};

describe('POST /auth/register', () => {
  it('creates a patient and returns it without the password hash', async () => {
    const res = await request(app).post('/auth/register').send(valid);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Asha Patient', email: 'asha@example.com' });
    expect(res.body.user.role).toBe('patient');
    expect(res.body.user.id).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2|correct-horse/);
  });

  it('stores an argon2 hash, never the plain password', async () => {
    await request(app).post('/auth/register').send(valid);

    const stored = await User.findOne({ email: valid.email }).select('+passwordHash');

    expect(stored?.passwordHash).not.toBe(valid.password);
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(stored!.passwordHash, valid.password)).toBe(true);
  });

  it('ignores a role sent by the client, so nobody can register as admin', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...valid, role: 'admin' });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('patient');
    expect((await User.findOne({ email: valid.email }))?.role).toBe('patient');
  });

  it('returns 409 for a duplicate email, even with different capital letters', async () => {
    await request(app).post('/auth/register').send(valid);

    const res = await request(app)
      .post('/auth/register')
      .send({ ...valid, email: 'ASHA@Example.com' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
    expect(await User.countDocuments()).toBe(1);
  });

  it('lets only one of two simultaneous registrations with the same email succeed', async () => {
    const results = await Promise.all([
      request(app).post('/auth/register').send(valid),
      request(app).post('/auth/register').send(valid),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await User.countDocuments()).toBe(1);
  });

  it('returns 400 for a short password and does not echo it back', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...valid, password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0].field).toBe('password');
    expect(JSON.stringify(res.body)).not.toContain('short');
    expect(await User.countDocuments()).toBe(0);
  });

  it.each([
    ['an invalid email', { email: 'not-an-email' }, 'email'],
    ['a missing name', { name: '' }, 'name'],
    ['a missing password', { password: undefined }, 'password'],
  ])('returns 400 for %s', async (_label, override, field) => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...valid, ...override });

    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toContain(field);
  });

  it('returns 400 for a body that is not valid JSON', async () => {
    const res = await request(app)
      .post('/auth/register')
      .set('Content-Type', 'application/json')
      .send('{ "name": ');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});
