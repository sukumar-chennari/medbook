import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { RefreshToken } from '../models/refresh-token';

// The token-related settings, passed in from the environment (and from tests).
export interface AuthConfig {
  accessSecret: string;
  accessTtlMinutes: number;
  refreshTtlDays: number;
  // Cookies marked "secure" are only sent over HTTPS. True in production, false on localhost.
  secureCookies: boolean;
}

interface TokenUser {
  id: string;
  role: string;
}

// The access token is a JWT: a signed note saying "this is user X with role Y until time T".
// We sign with HS256 (one shared secret) and name the algorithm explicitly,
// so verification can later insist on that exact algorithm.
export function signAccessToken(user: TokenUser, config: AuthConfig): string {
  return jwt.sign({ role: user.role }, config.accessSecret, {
    subject: user.id, // becomes the "sub" claim
    expiresIn: config.accessTtlMinutes * 60, // seconds
    algorithm: 'HS256',
  });
}

// The refresh token is NOT a JWT. It is 32 random bytes, which nobody can guess or forge.
// Whether it is valid is decided by looking it up in our database.
// A fast SHA-256 is fine for hashing it (unlike passwords) because the token is already
// random and long, so there is nothing to "guess" by brute force.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function issueSession(
  user: TokenUser,
  config: AuthConfig,
  family: string = randomUUID(),
) {
  const refreshToken = randomBytes(32).toString('base64url');
  const refreshExpiresAt = new Date(Date.now() + config.refreshTtlDays * 24 * 60 * 60 * 1000);

  await RefreshToken.create({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    family,
    expiresAt: refreshExpiresAt,
  });

  return { accessToken: signAccessToken(user, config), refreshToken, refreshExpiresAt };
}
