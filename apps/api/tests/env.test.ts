import { loadEnv } from '../src/config/env';

describe('loadEnv', () => {
  it('applies defaults and converts PORT to a number', () => {
    const env = loadEnv({ MONGO_URI: 'mongodb://x', REDIS_URL: 'redis://y', PORT: '5000' });

    expect(env.PORT).toBe(5000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('throws when a required variable is missing, naming it but not leaking values', () => {
    expect(() => loadEnv({ REDIS_URL: 'redis://secret-password@y' })).toThrow(/MONGO_URI/);
    expect(() => loadEnv({ REDIS_URL: 'redis://secret-password@y' })).not.toThrow(
      /secret-password/,
    );
  });
});
