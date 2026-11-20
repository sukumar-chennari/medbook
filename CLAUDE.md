# MedBook (working name) — Project Brief

> Hand this file to Claude Code at the start of the project (save it as `CLAUDE.md` or `PROJECT_BRIEF.md` in the repo root).
> Owner: Sukumar. Goal: a production-style, deployed full-stack medical appointment and pharmacy platform that I can fully explain in interviews.

---

## 0. How Claude Code should work with me (read first)

I am building this to **learn and to be able to defend every part in an interview**, not just to get working code.

1. **Teach, don't dump.** Work in small steps (one feature or file group at a time). Before writing code, explain the plan in plain, simple English. Avoid heavy jargon, and define any term you use.
2. **Split the work.** For each task, mark what **I write myself** and what **you help with** (see section 11). Review my code instead of rewriting it unless I ask.
3. **Ask before big decisions** (new library, schema change, folder restructure). Offer 2-3 options with the trade-off.
4. **Explain-back check.** After each feature, ask me 2-3 short questions about it. If I can't answer, re-explain.
5. **Never put secrets in the repo.** Use `.env` (git-ignored) and keep `.env.example` up to date.
6. **Synthetic data only.** No real patient data, ever. Use a seed script with fake names.
7. Small commits with clear messages. One feature per branch and pull request.
8. Keep a `docs/DECISIONS.md` log: what we chose, why, and the alternative we rejected.

---

## 1. Product scope

**Users and roles:** `patient`, `doctor`, `admin`.

**Part A, booking (built in phases 1-5 of section 10):**
- Patients register and log in, search doctors by name or speciality, view available slots, book, reschedule or cancel appointments, and see their history.
- Doctors set weekly availability and see their day's appointments.
- Admins manage doctors, view all appointments and see basic stats.
- Email or in-app reminders before appointments.

**Part B, pharmacy (phase 6 of section 10):**
- Medicine catalogue with search, stock count, cart and orders, and order status tracking (placed, packed, shipped, delivered).
- Admin inventory management.
- Prescription upload (file) for medicines that need one.

**Later (AI agents):** see section 9.

Out of scope for now: real payments (use a mock or the test mode of a payment provider), real video consultations, real insurance, EMR integration, insurance eligibility checks, and phone or voice agents (the AI agent is text-based only).

---

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Web app | React + TypeScript (Vite), React Router, TanStack Query, Zustand or Redux Toolkit, React Hook Form + Zod | Matches React/MERN roles |
| API | Node.js + Express + TypeScript, Zod validation | MERN core |
| Database | MongoDB with Mongoose | MERN match |
| Cache / queue | Redis (cache, rate limiting, sessions/token blacklist), BullMQ for background jobs | Real-world pattern |
| Real-time | Socket.IO for live notifications (appointment status, order status) | Already known |
| File storage | S3-compatible (MinIO locally, S3 or a compatible provider in production), presigned uploads | Prescription files |
| Reverse proxy | Nginx + Let's Encrypt (certbot) for HTTPS | Common interview topic |
| Containers | Docker + Docker Compose | The "blueprint" (section 4) |
| CI/CD | GitHub Actions | Build, test, deploy |
| Tests | Jest + Supertest (API), React Testing Library (web) | Basic quality bar |
| Logging | pino (structured JSON logs) | Debuggable production |

Check the latest stable versions at the time of setup. Do not guess versions from memory.

---

## 3. Architecture

```
                 Internet
                    |
            [ DNS: yourdomain ]
                    |
             [ VPS: Nginx ]  <- HTTPS (Let's Encrypt)
              /          \
     [ web: React ]    [ api: Express ] ---- [ MongoDB ]
      (static files)       |    |
                           |    +---------- [ Redis ] <---- [ worker: BullMQ ]
                           |                                    (reminders, emails,
                      [ Socket.IO ]                              later: AI agent tasks)
                           |
                   [ S3-compatible storage ]  (prescription files)
```

**Request path example (book appointment):** the web app calls `POST /appointments`, the API validates the token and role, checks the slot atomically in MongoDB, saves the appointment, queues a reminder job in Redis (BullMQ), emits a Socket.IO event to the doctor, and returns the result.

**Principles**
- The API is **stateless** (no data kept in memory between requests), so it can be copied later to scale.
- All secrets come from environment variables.
- The API is the **only** thing that talks to MongoDB, Redis and storage. The browser never does.

---

## 4. The "blueprint" template (one-command setup)

This is the template file idea: anyone can start the whole system from the config files, with no manual installs.

**Deliverables**
- `infra/docker-compose.yml` (local development): services `web`, `api`, `worker`, `mongo`, `redis`, `minio`, and `mongo-express` (dev only).
- `infra/docker-compose.prod.yml`: production overrides (no dev tools, restart policies, resource limits, Nginx, certbot).
- `.env.example` (every variable the system needs, with safe placeholder values and a comment on each).
- `Makefile` or npm scripts: `make up`, `make down`, `make logs`, `make seed`, `make test`.
- Health checks on every service (`/health` on the API, `redis-cli ping`, `mongosh` ping).
- Named volumes for MongoDB, Redis and MinIO data.
- `README.md` with "Run locally in 5 minutes" and "Deploy to a server" sections.

**Acceptance test:** on a fresh machine with only Docker installed, `cp .env.example .env && make up` brings up a working app with seed data.

**Later (optional):** Terraform or Ansible to create and configure the server automatically.

---

## 5. Redis: what it is used for (be able to explain each)

1. **Rate limiting** on login and public endpoints (for example 5 login attempts per minute per IP).
2. **Caching** read-heavy data, such as the doctor list and medicine catalogue, with an expiry time and cache invalidation on update.
3. **Token blacklist / refresh token store**, so logout truly invalidates tokens.
4. **Slot hold (short lock)** while a patient is completing a booking, to reduce double-booking.
5. **BullMQ job queue** for reminders and emails, with retries and backoff.
6. **Socket.IO adapter** (pub/sub), so real-time events work when there is more than one API container.

---

## 6. Data model (MongoDB collections, first draft)

- **users**: `_id, name, email (unique), passwordHash, role, createdAt`
- **doctorProfiles**: `userId, speciality, bio, consultationFee, weeklyAvailability[]`
- **slots**: `doctorId, start, end, status (free | booked | blocked)`, with a **unique index on (doctorId, start)**
- **appointments**: `patientId, doctorId, slotId, status (booked | cancelled | completed), reason, createdAt`
- **medicines**: `name, description, price, stock, requiresPrescription`
- **orders**: `patientId, items[{medicineId, qty, price}], total, status, prescriptionFileKey?, createdAt`
- **auditLogs**: `actorId, action, resourceType, resourceId, ip, createdAt` (who did what, never the sensitive content)
- **refreshTokens** (or in Redis): `userId, tokenHash, expiresAt`

**Important design point: preventing double booking.** Two patients tapping the same slot at the same time must not both succeed. Use an atomic update such as `findOneAndUpdate({ _id: slotId, status: 'free' }, { status: 'booked' })` together with the unique index. Explain this in the interview as "a race condition handled at the database level".

---

## 7. Security and privacy practices (even with fake data)

- Passwords hashed with argon2 or bcrypt. Never logged.
- JWT access token (short-lived) plus refresh token (httpOnly, secure cookie), with rotation.
- Role-based access control (RBAC) in middleware; always check ownership (a patient can only read their own appointments).
- Input validation with Zod on every endpoint; `helmet`, strict CORS, rate limits.
- Audit log for sensitive actions. **No sensitive data in logs or notification payloads** (send ids, not content).
- Encrypted connections everywhere (HTTPS); MongoDB and Redis not exposed to the internet, only on the Docker network.
- File uploads: allowed types and size limit, private bucket, presigned URLs that expire.
- Dependency updates and `npm audit` in CI.
- Server hardening: SSH key login only, no root login, firewall (ufw) allowing only 22, 80 and 443, automatic security updates.

Compliance note: this is a portfolio project with synthetic data. If it ever handles real patient data, legal requirements apply (for example India's DPDP Act, and HIPAA for US clients), and it needs a proper review. Document this in the README.

---

## 8. Deployment plan (single VPS + Docker Compose)

1. **Buy a domain** from any registrar (done by the owner).
2. **Create a small VPS** (Ubuntu LTS). Create a non-root user, add an SSH key, disable password login, enable the firewall.
3. **DNS:** create an `A` record for `yourdomain` and `api.yourdomain` (or one domain with path routing) pointing to the server's IP. Wait for propagation and verify with `dig`.
4. **Install Docker** and copy the compose files and `.env` to the server.
5. **Nginx + Let's Encrypt:** reverse proxy to the API, serve the web build, redirect HTTP to HTTPS, auto-renew certificates.
6. **CI/CD (GitHub Actions):** on merge to `main`, run tests, build Docker images, push them to a registry (GitHub Container Registry), then SSH to the server and run `docker compose pull && docker compose up -d`.
7. **Backups:** a nightly `mongodump` (cron) to object storage, plus a documented **restore test** (a backup that is never tested is not a backup).
8. **Monitoring:** an uptime check (free service), structured logs, and a `/health` endpoint. Optional later: Prometheus and Grafana.
9. **Zero-downtime thinking:** know the limits of single-server deploys, and be able to explain how you would improve them (load balancer, managed database, blue-green deploys).

---

## 9. AI agents plan (later phase, but design for it now)

**Goal:** an assistant that automates tasks such as "book me a cardiologist next Tuesday evening" or "reorder my usual medicine".

**Design now, so the API is agent-ready**
- Every action is a clean, documented API endpoint (publish an OpenAPI spec).
- Write endpoints are **idempotent** (use an idempotency key), so a retried agent call does not create duplicates.
- Each endpoint has strict validation and clear error messages.

**Agent architecture (separate `agent-service`)**
- The service receives a user message, calls an LLM with **tool calling**, and the tools are thin wrappers over your own API:
  `search_doctors`, `get_available_slots`, `book_appointment`, `cancel_appointment`, `search_medicines`, `create_order`.
- **Start with one agent**, with a loop: model decides, tool runs, result goes back, until done. Only add more agents if there is a clear need (for example a separate "reminder" agent).
- Conversation memory stored per user (MongoDB or Redis), with a size limit.

**Guardrails (important for healthcare)**
- **Human confirmation before any write action** ("Book Dr. X on Tue 6 PM? Confirm"). The agent proposes, the user approves.
- The agent acts **with the user's own permissions** (their token), never an admin token.
- No medical advice or diagnosis. Refuse or redirect to a doctor.
- Send the LLM only the minimum data needed. No sensitive data in prompts where avoidable.
- Log every tool call (who, what, result) into the audit log. Add per-user rate limits and a cost cap.
- Timeouts, retries with backoff for 429 and 5xx, and a friendly fallback when the model fails.
- Observability: log token usage, latency and tool-call success per request.
- Test with a small set of scripted conversations (an "eval" file) before shipping.

---

## 10. Phases and milestones

Effort is a rough guess for about 8-10 hours per week. Adjust as we learn the real pace.

| Phase | Outcome | Definition of done |
|---|---|---|
| 0. Foundation (about 1 week) | Monorepo, Docker Compose with API + Mongo + Redis, `/health`, CI running lint and tests | `make up` works on a clean machine |
| 1. Auth and roles (about 1 week) | Register, login, refresh, logout, RBAC, rate limiting with Redis | Tests pass, tokens rotate, brute force is blocked |
| 2. Doctors and booking (1-2 weeks) | Availability, slots, atomic booking, cancel and reschedule | Two parallel booking requests: only one succeeds (test proves it) |
| 3. Web app for booking (1-2 weeks) | React UI for patient, doctor and admin dashboards | Full booking flow works in the browser |
| 4. Reminders and real-time (about 1 week) | BullMQ reminder jobs, Socket.IO notifications | A reminder job runs on time, with retries |
| 5. Deploy v1 (about 1 week) | Live on the domain with HTTPS, CI/CD, backups, monitoring | Public URL works, a restore test is done |
| 6. Pharmacy (2 weeks) | Catalogue, cart, orders, prescription upload, order tracking | End-to-end order flow with stock checks |
| 7. AI agent v1 (2 weeks) | Booking assistant with tools, confirmations and guardrails | Scripted conversations pass, writes need approval |
| 8. Polish | README, architecture diagram, demo video, interview notes | Another person can run it from the README |

Deploy v1 comes **before** pharmacy on purpose. A live booking product early is worth more than a bigger unfinished one.

---

## 11. Who writes what (learning split)

**I write myself (Claude Code reviews):**
- Auth logic: login, token creation and refresh, middleware
- RBAC and ownership checks
- Booking logic, including the atomic slot update
- Core React data-fetching and state logic (hooks, forms)
- Redis rate limiter and the BullMQ job processor
- Agent tool definitions and the guardrail rules

**Claude Code helps with:**
- Project scaffolding, Docker and Nginx config
- CI workflow files
- UI styling and layout
- Test case ideas, README and diagrams
- Explaining errors and reviewing my code for bugs and security

**Rule:** if I can't explain a file in my own words, it isn't finished.

---

## 12. Interview talking points to build along the way

- Why MongoDB here, and where I'd consider PostgreSQL instead
- How double booking is prevented
- JWT access plus refresh tokens, and how logout works
- What each Redis feature is for, and what happens if Redis is down
- Docker Compose blueprint: what each service does
- How DNS and HTTPS work from buying the domain to the first request
- How I would scale beyond one server
- Agent guardrails: why human confirmation, why scoped permissions, why audit logs
- Honest AI usage: what Claude helped with and what I wrote myself

---

## 13. First task for Claude Code

"Read this brief. Do **Phase 0 only**. First propose the folder structure and the list of files you will create, and explain it in simple words. Wait for my approval before generating anything."
