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

## 011. Two JWT secrets, validated at startup

- **Chose:** separate `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`, each at least 32 characters, checked by Zod when the API starts.
- **Why:** leaking one does not compromise the other, and a weak secret stops the server instead of silently weakening security.
