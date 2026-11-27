import { Router, type CookieOptions, type Response } from 'express';
import { loginSchema, registerSchema } from '../schemas/auth';
import { AppError } from '../lib/errors';
import { loginUser, logoutSession, refreshSession, registerUser } from '../services/auth.service';
import type { AuthConfig } from '../services/token.service';

export const REFRESH_COOKIE = 'refresh_token';

export function createAuthRouter(config: AuthConfig): Router {
  const router = Router();

  // The refresh token travels ONLY in this cookie, never in the JSON body:
  //  - httpOnly: JavaScript on the page cannot read it, so an XSS bug cannot steal it
  //  - secure:   only sent over HTTPS (in production)
  //  - sameSite: other websites cannot make the browser send it (CSRF protection)
  //  - path:     the browser sends it only to /auth/..., not to every request
  const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'strict',
    path: '/auth',
  };
  const setRefreshCookie = (res: Response, token: string, expires: Date) =>
    res.cookie(REFRESH_COOKIE, token, { ...cookieOptions, expires });
  // To delete a cookie the browser needs the same path, so we reuse the same options.
  const clearRefreshCookie = (res: Response) => res.clearCookie(REFRESH_COOKIE, cookieOptions);

  // POST /auth/register
  router.post('/register', async (req, res) => {
    // parse() throws if the input is invalid. The central error handler turns that into a 400.
    const input = registerSchema.parse(req.body);
    const user = await registerUser(input);
    res.status(201).json({ user });
  });

  // POST /auth/login
  router.post('/login', async (req, res) => {
    const input = loginSchema.parse(req.body);
    const { user, accessToken, refreshToken, refreshExpiresAt } = await loginUser(input, config);

    setRefreshCookie(res, refreshToken, refreshExpiresAt);

    // The short-lived access token goes in the body. The web app keeps it in memory
    // and sends it in the "Authorization: Bearer ..." header.
    res.json({ user, accessToken });
  });

  // POST /auth/refresh  (no body: the browser sends the refresh cookie by itself)
  router.post('/refresh', async (req, res) => {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    try {
      if (typeof token !== 'string' || token.length === 0) {
        throw new AppError(401, 'NO_REFRESH_TOKEN', 'Please log in');
      }
      const { user, accessToken, refreshToken, refreshExpiresAt } = await refreshSession(
        token,
        config,
      );
      setRefreshCookie(res, refreshToken, refreshExpiresAt);
      res.json({ user, accessToken });
    } catch (err) {
      // A failed refresh means the cookie is useless, so tell the browser to delete it.
      if (err instanceof AppError) clearRefreshCookie(res);
      throw err;
    }
  });

  // POST /auth/logout
  router.post('/logout', async (req, res) => {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    await logoutSession(typeof token === 'string' ? token : undefined);
    clearRefreshCookie(res);
    res.status(204).end();
  });

  return router;
}
