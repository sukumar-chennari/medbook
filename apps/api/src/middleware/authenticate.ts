import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../lib/errors';
import { USER_ROLES, type UserRole } from '../models/user';
import type { AuthConfig } from '../services/token.service';

export interface AuthUser {
  id: string;
  role: UserRole;
}

// Tells TypeScript that after this middleware runs, "req.user" exists.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Guard 1: "Who are you?"
// Reads the access token from "Authorization: Bearer <token>", checks it, and writes
// the user's id and role onto the request. It never touches the database: the signature
// and the expiry time are enough, which is what makes access tokens fast.
export function authenticate(config: AuthConfig): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(
        401,
        'NO_TOKEN',
        'Send an access token as "Authorization: Bearer <token>"',
      );
    }
    const token = header.slice('Bearer '.length).trim();

    let payload: string | jwt.JwtPayload;
    try {
      // algorithms: ['HS256'] is important. Without pinning, a forger can claim a different
      // algorithm (the famous "alg: none" trick) and skip the signature check entirely.
      payload = jwt.verify(token, config.accessSecret, { algorithms: ['HS256'] });
    } catch (err) {
      // A separate code for "expired" lets the web app know it should refresh and retry,
      // instead of sending the user to the login page.
      if (err instanceof jwt.TokenExpiredError) {
        throw new AppError(401, 'TOKEN_EXPIRED', 'Access token has expired');
      }
      throw new AppError(401, 'INVALID_TOKEN', 'Access token is invalid');
    }

    // The signature is valid, but still check the contents are what we issue.
    const role = typeof payload === 'object' ? payload.role : undefined;
    if (
      typeof payload !== 'object' ||
      typeof payload.sub !== 'string' ||
      !USER_ROLES.includes(role as UserRole)
    ) {
      throw new AppError(401, 'INVALID_TOKEN', 'Access token is invalid');
    }

    req.user = { id: payload.sub, role: role as UserRole };
    next();
  };
}
