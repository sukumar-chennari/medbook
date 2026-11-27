# Decisions log

What we chose, why, and the alternative we rejected. Add an entry for every real decision.

## 001. npm workspaces for the monorepo

- **Chose:** npm workspaces (`apps/api`, `apps/worker`, `apps/web`), one root `package-lock.json`.
- **Why:** nothing extra to install or learn; the same `npm` commands work everywhere.
- **Rejected:** pnpm workspaces (faster, stricter, but one more tool); Turborepo (build caching we do not need yet).

## 002. TypeScript 6.0, not 7.x

- **Chose:** `typescript ~6.0.3`.
- **Why:** on 2026-11-20 the latest TypeScript is 7.0.2, but `ts-jest` supports `<7` and `typescript-eslint` supports `<6.1`. Using 7 would break tests and linting.
- **Revisit:** when both tools declare TypeScript 7 support.

## 003. Dependency injection for health checks

- **Chose:** `createApp({ logger, corsOrigin, healthChecks })` takes its dependencies as arguments.
- **Why:** tests pass in fake checks (always up, always down, throws), so they need no database or Redis.
- **Rejected:** importing the Mongo and Redis clients directly inside the route (needs real services in every test).

## 004. No `dotenv` package

- **Chose:** Docker Compose injects environment variables into each container. The app validates them with Zod at startup (`apps/api/src/config/env.ts`).
- **Why:** one fewer dependency; a missing variable stops the server at once with a clear message.

## 005. All development runs inside Docker

- **Chose:** `make up` runs api, worker, web, Mongo, Redis and mongo-express in containers. Source folders are bind-mounted for live reload.
- **Why:** a fresh machine with only Docker works, which is the "blueprint" goal. Mongo/Redis hostnames are Docker service names.
- **Trade-off:** slower first build. Tests and lint also run on the host with plain Node.

## 006. Ports bound to 127.0.0.1

- **Chose:** every published dev port is `127.0.0.1:PORT:PORT`.
- **Why:** databases are reachable from this laptop only, not from other devices on the same Wi-Fi.

## 007. S3-compatible storage: OPEN, not decided

- **Problem:** the brief says MinIO, but the `minio/minio` image no longer exists on Docker Hub (404 on 2026-11-20) and the community project stopped publishing images.
- **Options:** (a) RustFS (S3-compatible, actively published), (b) Garage (lightweight, S3-compatible), (c) SeaweedFS, (d) skip local S3 and use a free cloud bucket for dev.
- **Needed by:** Phase 6 (prescription uploads). Nothing in Phase 0 to 5 depends on it.
- **Status:** the compose file has a TODO placeholder.

## 008. Worker health check uses a heartbeat file

- **Chose:** the worker touches `/tmp/worker-healthy` every 15s while Redis answers; Docker checks the file is under 60s old.
- **Why:** the worker has no HTTP port, so there is nothing to call. A stale file means "Redis is unreachable or the process is stuck".

## 009. argon2 for password hashing

- **Chose:** `argon2` (argon2id).
- **Why:** current best practice, memory-hard (expensive for attackers with GPUs), no 72-byte password limit like bcrypt.
- **Rejected:** `bcrypt` (older, 72-byte limit); `bcryptjs` (pure JS, slower).
- **Untested:** the Docker (Alpine) install of argon2's prebuilt binary. Verify with `make up` once Docker is set up.

## 010. In-memory MongoDB for tests

- **Chose:** `mongodb-memory-server` starts a real temporary `mongod` per test run (binary cached after the first download).
- **Why:** tests run without Docker and start from an empty database. It is a real MongoDB, so unique indexes and atomic updates (the double-booking test in Phase 2) behave truly.
- **Quirk:** the MongoDB driver loads Node's `os` with a dynamic `import()`, which Jest's sandbox cannot do, so the driver sent an empty handshake and the server rejected it. `tests/helpers/db.ts` passes `runtimeAdapters: { os }` to fix it. Tests only, not production code.
- **Not covered:** Redis-based tests (rate limiter) need a real Redis; they come after Docker works.

## 011. JWT secret validated at startup (the second secret was dropped, see 015)

- **Chose:** separate `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`, each at least 32 characters, checked by Zod when the API starts.
- **Why:** leaking one does not compromise the other, and a weak secret stops the server instead of silently weakening security.

## 012. Register: let the database decide on duplicate emails

- **Chose:** try to save, and turn MongoDB's duplicate-key error (code 11000) into a 409 `EMAIL_TAKEN`.
- **Why:** "check if the email exists, then save" leaves a gap where two simultaneous requests both pass the check. The unique index has no gap. A test fires two registrations at once and expects exactly one 201 and one 409.
- **Trade-off:** a 409 tells a stranger whether an email is registered (user enumeration). Accepted for friendlier sign-up; login errors will stay vague, and rate limiting (Redis) will slow guessing.

## 013. One error shape for the whole API

- **Chose:** every error is `{ "error": { "code", "message", "details?" } }`, built in `middleware/error-handler.ts` from `ZodError`, `AppError` or unknown errors.
- **Why:** the web app can switch on `code`, validation errors name fields but never echo values (a value could be a password), and unknown errors return a generic 500 while the real cause goes to the logs.

## 014. Role is never read from the client

- **Chose:** the register schema has no `role` field. Zod drops unknown keys, and the model default (`patient`) applies. Doctors and admins will be created by an admin or the seed script.
- **Why:** prevents privilege escalation. A test sends `role: "admin"` and expects a patient.

## 015. Refresh tokens are random values stored hashed in MongoDB (not JWTs, not Redis)

- **Chose:** the refresh token is 32 random bytes. We store its SHA-256 hash in a `refreshtokens` collection (with `userId`, `family`, `expiresAt`, `revokedAt`). A TTL index deletes expired ones automatically. This replaces the second secret from decision 011, so `JWT_REFRESH_SECRET` was removed.
- **Why:** validity is decided by a database lookup anyway (we need it for rotation and logout), so signing adds nothing. A random token cannot be forged, and a leaked database holds only hashes. Mongo is durable, so a Redis restart cannot log everyone out or un-revoke tokens, and it needs no Docker to test.
- **Rejected:** a refresh JWT (extra secret and more to explain for no gain); Redis as the store (the brief allows it, but Redis becomes a dependency of login, and we cannot test it yet). Redis stays for rate limiting, and can be revisited for a fast revoked-token check.
- **Why SHA-256 and not argon2:** the token is long and random, so there is nothing to brute-force. Slow hashing is for human-chosen passwords.

## 016. Login errors are deliberately vague and equally slow

- **Chose:** "no such email" and "wrong password" return the identical 401 `INVALID_CREDENTIALS`, and the server always runs one argon2 check (against a throwaway hash when the email is unknown).
- **Why:** identical messages stop an attacker learning which emails exist, and equal timing stops them learning it by stopwatch. Registration still reveals duplicates (decision 012), a known trade-off.

## 017. Cookie and token delivery

- **Chose:** access token in the JSON body (kept in memory by the web app, sent as `Authorization: Bearer`); refresh token only in an `httpOnly`, `SameSite=Strict`, `Path=/auth` cookie, `Secure` in production.
- **Why:** an XSS bug cannot read the refresh token, other sites cannot trigger it, and the browser does not send it on ordinary API calls.

## 018. Refresh rotation with reuse detection

- **Chose:** every refresh token works once. `/auth/refresh` claims it with a single atomic `findOneAndUpdate` (unused and unexpired, mark used), then issues a new token in the same family. If a token that was already used comes back, the whole family is cancelled.
- **Why:** a real user always holds the newest token, so an old one reappearing means a copy exists. Cancelling the family cuts the thief off (and logs the real user out, who just logs in again). The atomic claim means two simultaneous requests with the same token cannot both win.
- **Known trade-off:** two browser tabs refreshing in the same instant look like reuse and log the user out. The web app (Phase 3) should refresh from one place. A short "grace window" could be added later if it hurts in practice.
- **Role and deletion take effect at refresh:** the user is re-read from the database, so a role change or deleted account applies within one access-token lifetime (15 min).
- **TODO (audit log phase):** record reuse detection as a security event. Today it is silent.

## 019. Logout always answers 204

- **Chose:** logout cancels the token's family and clears the cookie, and succeeds even with no cookie or an unknown token.
- **Why:** it never reveals whether a token was real, and repeating it is harmless.
- **Limit to remember:** the current access token still works until it expires (up to 15 min). That is the price of stateless access tokens, and why they are short.

## 020. Retry when the in-memory MongoDB picks a busy port

- **Chose:** `startTestDb` retries up to 5 times.
- **Why:** parallel test files each start a temporary mongod and occasionally pick the same random port ("Port already in use"). It failed once in a full run, and passed 5 runs in a row after the fix.

## 021. Access tokens are checked by signature and expiry only, with the algorithm pinned

- **Chose:** `authenticate` verifies the JWT with `algorithms: ['HS256']`, then checks that `sub` is a string and `role` is one of our roles. No database lookup per request.
- **Why:** this is what makes access tokens fast and the API stateless. Pinning the algorithm blocks "alg: none" and algorithm-swap forgeries; tests cover both, plus a tampered payload and a foreign secret.
- **Trade-off:** the role inside a token can be up to 15 minutes old (see 018), and a logged-out user's access token works until it expires (see 019). A Redis denylist checked per request would give instant revocation, at the cost of one lookup per request. Not needed yet.

## 022. 401 vs 403, and a separate TOKEN_EXPIRED code

- **Chose:** 401 means "we don't know who you are" (no, bad or expired token); 403 means "we know who you are and this is not allowed". Expiry returns `TOKEN_EXPIRED`, other token problems `INVALID_TOKEN`.
- **Why:** the web app must react differently: on `TOKEN_EXPIRED` it silently calls `/auth/refresh` and retries; on `INVALID_TOKEN` or 403 it does not.

## 023. requireRole fails closed

- **Chose:** `requireRole` answers 401 if `req.user` is missing, instead of passing the request on.
- **Why:** if a developer forgets `authenticate` before it, the door stays locked instead of silently open. A test covers it.
- **Not done yet:** ownership checks ("a patient can only read their own appointments") arrive with appointments in Phase 2.
