import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';
import type { UserRole } from '../models/user';

// Guard 2: "Are you allowed in here?"  Use it AFTER authenticate:
//   router.get('/admin/stats', authenticate(config), requireRole('admin'), handler)
//
//   401 = "I don't know who you are"      (authenticate says this)
//   403 = "I know who you are, and this isn't for you"  (this guard says this)
export function requireRole(...allowed: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    // If someone forgot to put authenticate first, refuse (fail closed) instead of letting
    // everyone through by accident.
    if (!req.user) {
      throw new AppError(401, 'NO_TOKEN', 'Authentication is required');
    }
    if (!allowed.includes(req.user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this');
    }
    next();
  };
}
