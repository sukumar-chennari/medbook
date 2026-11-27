import { Router } from 'express';
import { loginSchema, registerSchema } from '../schemas/auth';
import { loginUser, registerUser } from '../services/auth.service';
import type { AuthConfig } from '../services/token.service';

export const REFRESH_COOKIE = 'refresh_token';

export function createAuthRouter(config: AuthConfig): Router {
  const router = Router();

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

    // The refresh token travels ONLY in this cookie, never in the JSON body:
    //  - httpOnly: JavaScript on the page cannot read it, so an XSS bug cannot steal it
    //  - secure:   only sent over HTTPS (in production)
    //  - sameSite: other websites cannot make the browser send it (CSRF protection)
    //  - path:     the browser sends it only to /auth/..., not to every request
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: 'strict',
      path: '/auth',
      expires: refreshExpiresAt,
    });

    // The short-lived access token goes in the body. The web app keeps it in memory
    // and sends it in the "Authorization: Bearer ..." header.
    res.json({ user, accessToken });
  });

  return router;
}
