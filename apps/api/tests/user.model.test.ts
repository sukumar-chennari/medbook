import { User } from '../src/models/user';
import { clearTestDb, DB_START_TIMEOUT_MS, startTestDb, stopTestDb } from './helpers/db';

beforeAll(async () => {
  await startTestDb();
  await User.init(); // make sure the unique index exists before we test it
}, DB_START_TIMEOUT_MS);

afterEach(clearTestDb);
afterAll(stopTestDb);

const base = { name: 'Test Patient', email: 'Test@Example.com', passwordHash: 'not-a-real-hash' };

describe('User model', () => {
  it('defaults the role to patient and lowercases the email', async () => {
    const user = await User.create(base);

    expect(user.role).toBe('patient');
    expect(user.email).toBe('test@example.com');
  });

  it('rejects a duplicate email at the database level', async () => {
    await User.create(base);

    await expect(User.create({ ...base, email: 'TEST@example.com' })).rejects.toMatchObject({
      code: 11000, // MongoDB's "duplicate key" error
    });
  });

  it('rejects an unknown role', async () => {
    // TypeScript already blocks this; the cast lets us prove the database layer blocks it too.
    const badRole = 'superhero' as 'patient';

    await expect(User.create({ ...base, role: badRole })).rejects.toThrow(/role/);
  });

  it('does not return passwordHash unless it is asked for explicitly', async () => {
    await User.create(base);

    const normal = await User.findOne({ email: 'test@example.com' });
    const withHash = await User.findOne({ email: 'test@example.com' }).select('+passwordHash');

    expect(normal?.passwordHash).toBeUndefined();
    expect(withHash?.passwordHash).toBe('not-a-real-hash');
  });
});
