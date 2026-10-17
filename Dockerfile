# One image for every Cloud Run workload (infrastructure.md §1):
#   web      node build                    (GUAD_SERVICE=web)
#   worker   node build                    (GUAD_SERVICE=worker: job + webhook routes)
#   migrate  node scripts/db-setup.mjs     (Cloud Run job, run before each deploy)
# No secrets or .env files are baked in; Cloud Run supplies the environment.

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Install scripts stay off: nothing the build needs relies on them.
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
# Public browser endpoints must be known while hashing the prerendered offline CSP.
# These are public origins, never credentials; runtime variables still configure dynamic pages.
ARG PUBLIC_POWERSYNC_URL
ARG PUBLIC_AUTH_EMULATOR_URL
RUN PUBLIC_POWERSYNC_URL="$PUBLIC_POWERSYNC_URL" PUBLIC_AUTH_EMULATOR_URL="$PUBLIC_AUTH_EMULATOR_URL" npm run build \
    && npm prune --omit=dev --ignore-scripts

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
# What db-setup.mjs reads: migrations, RLS policies, sync streams (for the
# PowerSync publication) and the shared connection settings.
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/db-setup.mjs /app/scripts/sync-rules.mjs ./scripts/
COPY --from=build /app/src/lib/server/db/pool.ts ./src/lib/server/db/pool.ts
COPY --from=build /app/.specify/rls.sql /app/.specify/offline-sync.md ./.specify/
COPY --from=build /app/.specify/sql-patches ./.specify/sql-patches
USER node
EXPOSE 8080
CMD ["node", "build"]
