# MedBook

A medical appointment and pharmacy platform. Portfolio project: **synthetic data only**, no real patients.

Stack: React + TypeScript (Vite), Node.js + Express, MongoDB, Redis + BullMQ, Docker Compose.
Project plan and rules: [CLAUDE.md](CLAUDE.md). Why things were chosen: [docs/DECISIONS.md](docs/DECISIONS.md).

> Status: **Phase 0 (foundation)**. API has `/health`; worker and web are placeholders.

## Run locally in 5 minutes

You only need [Docker Desktop](https://www.docker.com/products/docker-desktop/) and `make`.

```bash
cp .env.example .env
```

```bash
make up
```

Then open:

- Web: http://localhost:5173
- API health: http://localhost:4000/health (expect `"status": "ok"`)
- Mongo browser: http://localhost:8081 (login from `.env`)

Other commands: `make help` lists them (`logs`, `ps`, `seed`, `test`, `down`, `reset`).

### Without Docker (only for lint, type checks, unit tests)

Needs Node 22 (`.nvmrc`).

```bash
npm install
npm run lint && npm run typecheck && npm test
```

## Layout

```
apps/api      Express API (the only thing that talks to Mongo and Redis)
apps/worker   BullMQ worker (reminders and emails, from Phase 4)
apps/web      React app
infra/        docker-compose files
docs/         decision log
```

## Deploy to a server

Coming in Phase 5 (VPS, DNS, Nginx, Let's Encrypt, CI/CD, backups).

## Compliance note

This project uses synthetic data. If it ever handled real patient data, legal requirements would apply (for example India's DPDP Act, and HIPAA for US clients) and it would need a proper review.
