# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# base: shared image + corepack/pnpm setup
# ---------------------------------------------------------------------------
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

# ---------------------------------------------------------------------------
# dependencies: full dependency graph (dev included), used to build the app
# and to run drizzle-kit migrations against the target database. Not shipped
# to production — the runtime stage only carries production dependencies.
# ---------------------------------------------------------------------------
FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .

# ---------------------------------------------------------------------------
# build: compiles the React client and bundles the Express/tRPC server
# ---------------------------------------------------------------------------
FROM dependencies AS build
ARG VITE_APP_ID
ARG VITE_OAUTH_PORTAL_URL
ARG VITE_CARTO_API_KEY
ENV VITE_APP_ID=${VITE_APP_ID}
ENV VITE_OAUTH_PORTAL_URL=${VITE_OAUTH_PORTAL_URL}
ENV VITE_CARTO_API_KEY=${VITE_CARTO_API_KEY}
RUN pnpm build

# ---------------------------------------------------------------------------
# runtime: minimal production image
# ---------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist

RUN addgroup -S axedispatch && adduser -S axedispatch -G axedispatch
USER axedispatch

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/ >/dev/null 2>&1 || exit 1

CMD ["node", "dist/index.js"]
