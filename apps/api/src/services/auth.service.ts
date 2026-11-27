import argon2 from 'argon2';
import { AppError } from '../lib/errors';
import { User, type UserRole } from '../models/user';
import type { LoginInput, RegisterInput } from '../schemas/auth';
import { issueSession, type AuthConfig } from './token.service';

// MongoDB reports "this value already exists in a unique index" as error code 11000.
function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 11000;
}

interface UserLike {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
}

// Only the fields that are safe to show. passwordHash is never included.
function toPublicUser(user: UserLike) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export async function registerUser({ name, email, password }: RegisterInput) {
  // Never store the password itself, only its argon2 hash.
  const passwordHash = await argon2.hash(password);

  try {
    // No "role" is passed in, so the model's default ('patient') is always used.
    const user = await User.create({ name, email, passwordHash });
    return toPublicUser(user as unknown as UserLike);
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

// A real argon2 hash of a throwaway password, created once. See loginUser for why.
let dummyHash: Promise<string> | undefined;
function getDummyHash(): Promise<string> {
  dummyHash ??= argon2.hash('this-password-is-never-used');
  return dummyHash;
}

export async function loginUser({ email, password }: LoginInput, config: AuthConfig) {
  // passwordHash is hidden by default, so we ask for it explicitly here.
  const user = await User.findOne({ email }).select('+passwordHash');

  // Always do one argon2 check, even when the email is unknown. Hashing is slow (~50ms), so
  // "unknown email" would otherwise answer much faster than "wrong password", and an attacker
  // could time the responses to discover which emails have accounts (a timing attack).
  const passwordOk = await argon2.verify(user?.passwordHash ?? (await getDummyHash()), password);

  // Same error and same words for "no such email" and "wrong password", on purpose.
  if (!user || !passwordOk) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
  }

  const session = await issueSession({ id: user.id as string, role: user.role }, config);
  return { user: toPublicUser(user as unknown as UserLike), ...session };
}
