# syntax=docker/dockerfile:1
# Dev server only for now. A production stage (build, then serve static files with Nginx)
# is added in Phase 5. Build context is the repo ROOT.

FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/web --include-workspace-root

FROM deps AS dev
COPY apps/web apps/web
WORKDIR /repo/apps/web
ENV NODE_ENV=development
CMD ["npm", "run", "dev"]
