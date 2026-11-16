# syntax=docker/dockerfile:1
# Game server image. Build on an arm64 machine (Apple Silicon) for the Oracle Ampere VM.
# See docs/DEPLOY.md.

# ---- build: install the workspace and bundle the server into one file ----
FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN npm install -g pnpm@12.21.0
COPY . .
RUN pnpm install --frozen-lockfile --filter "@settlers/server..."
RUN pnpm --filter @settlers/server build

# ---- runtime: just Node, the bundle and the SQL migrations ----
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=build /repo/apps/server/dist/ ./
COPY apps/server/migrations/ ./migrations/
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "server.mjs"]
