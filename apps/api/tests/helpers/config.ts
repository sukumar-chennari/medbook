import type { AuthConfig } from '../../src/services/token.service';

// Token settings for tests. The secret is a fake that exists only in test code.
export const testAuthConfig: AuthConfig = {
  accessSecret: 'test-access-secret-that-is-at-least-32-chars',
  accessTtlMinutes: 15,
  refreshTtlDays: 7,
  secureCookies: false,
};
