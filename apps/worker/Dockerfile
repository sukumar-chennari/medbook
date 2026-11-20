# syntax=docker/dockerfile:1
# Same pattern as apps/api/Dockerfile. Build context is the repo ROOT.

FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/
RUN npm ci --workspace apps/worker --include-workspace-root

FROM deps AS dev
COPY apps/worker apps/worker
WORKDIR /repo/apps/worker
ENV NODE_ENV=development
CMD ["npm", "run", "dev"]

FROM deps AS build
COPY apps/worker apps/worker
RUN npm run build --workspace apps/worker

FROM node:22-alpine AS prod
WORKDIR /repo
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/
RUN npm ci --workspace apps/worker --omit=dev && npm cache clean --force
COPY --from=build /repo/apps/worker/dist apps/worker/dist
USER node
WORKDIR /repo/apps/worker
CMD ["node", "dist/index.js"]
