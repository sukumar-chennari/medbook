# syntax=docker/dockerfile:1
# Build context is the repo ROOT (npm workspaces share one package-lock.json).

# --- deps: install packages. Cached until package files change, so rebuilds are fast.
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci --workspace apps/api --include-workspace-root

# --- dev: used by docker-compose.yml. Source is bind-mounted for live reload.
FROM deps AS dev
COPY apps/api apps/api
WORKDIR /repo/apps/api
ENV NODE_ENV=development
CMD ["npm", "run", "dev"]

# --- build: compile TypeScript to plain JavaScript in dist/ (used in production, Phase 5).
FROM deps AS build
COPY apps/api apps/api
RUN npm run build --workspace apps/api

# --- prod: small final image. Only production packages + compiled code, runs as non-root.
FROM node:22-alpine AS prod
WORKDIR /repo
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
RUN npm ci --workspace apps/api --omit=dev && npm cache clean --force
COPY --from=build /repo/apps/api/dist apps/api/dist
USER node
WORKDIR /repo/apps/api
CMD ["node", "dist/index.js"]
