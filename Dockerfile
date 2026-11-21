# syntax=docker/dockerfile:1

# ---- Build: install, compile, keep only production dependencies ----
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
# better-sqlite3 normally downloads a prebuilt binary; if that is not possible it compiles itself.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY packages/core packages/core
COPY apps/server apps/server
COPY apps/web apps/web
# The web UI shows the changelog and the manual.
COPY CHANGELOG.md CHANGELOG.de.md ./
COPY docs/manual docs/manual
RUN pnpm --filter @pam/core --filter @pam/server --filter @pam/web build \
 && pnpm --filter @pam/server deploy --prod --legacy /app \
 && cp -r apps/web/dist /app/public

# ---- Runtime ----
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data WEB_DIR=/app/public
WORKDIR /app
COPY --from=build /app /app
COPY docker/entrypoint.sh /usr/local/bin/pam-entrypoint
RUN chmod 755 /usr/local/bin/pam-entrypoint && mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# The entrypoint fixes the rights of /data and then drops to the user "node".
ENTRYPOINT ["pam-entrypoint"]
CMD ["node", "dist/index.js"]
