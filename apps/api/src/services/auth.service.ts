import argon2 from 'argon2';
import { AppError } from '../lib/errors';
import { User } from '../models/user';
import type { RegisterInput } from '../schemas/auth';

// MongoDB reports "this value already exists in a unique index" as error code 11000.
function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 11000;
}

export async function registerUser({ name, email, password }: RegisterInput) {
  // Never store the password itself, only its argon2 hash.
  const passwordHash = await argon2.hash(password);

  try {
    // No "role" is passed in, so the model's default ('patient') is always used.
    const user = await User.create({ name, email, passwordHash });

    // Return only the fields that are safe to show. passwordHash is never included.
    return {
      id: user.id as string,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };
  } catch (err) {
    // We just try to save and let the database's unique index be the judge.
    // "Check if the email exists, then save" has a gap: two requests arriving together
    // can both pass the check. The index closes that gap.
    if (isDuplicateKeyError(err)) {
      throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
    }
    throw err;
  }
}
