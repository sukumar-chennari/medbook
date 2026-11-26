import { loadEnv } from '../src/config/env';

const valid = {
  MONGO_URI: 'mongodb://x',
  REDIS_URL: 'redis://y',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
};

describe('loadEnv', () => {
  it('applies defaults and converts PORT to a number', () => {
    const env = loadEnv({ ...valid, PORT: '5000' });

    expect(env.PORT).toBe(5000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.ACCESS_TOKEN_TTL_MINUTES).toBe(15);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(7);
  });

  it('throws when a required variable is missing, naming it but not leaking values', () => {
    const source = { ...valid, REDIS_URL: 'redis://secret-password@y', MONGO_URI: undefined };

    expect(() => loadEnv(source)).toThrow(/MONGO_URI/);
    expect(() => loadEnv(source)).not.toThrow(/secret-password/);
  });

  it('rejects a JWT secret shorter than 32 characters', () => {
    expect(() => loadEnv({ ...valid, JWT_ACCESS_SECRET: 'too-short' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });
});
