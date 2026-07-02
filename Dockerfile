# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app

# ---- Dependencies for the build (includes devDependencies) ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

# ---- Build the Next.js app ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Production-only dependencies (full install, no tracing gaps) ----
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund

# ---- Final runtime image ----
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 -G nodejs

# Full production node_modules (covers both `next start`'s standalone
# server and scripts/*.mjs — migrate.mjs and audit-cleanup.mjs, both run
# directly by the container/Coolify scheduled tasks — which Next's output
# tracing wouldn't otherwise pick up since neither is imported by the app).
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/server.js ./server.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

USER nextjs

EXPOSE 3000

# /login is the only unauthenticated page (middleware.ts doesn't guard it),
# so it's a safe target to confirm the server is actually serving requests.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# `exec` replaces the shell with `node server.js` so it becomes PID 1 and
# receives SIGTERM directly from Docker/Coolify instead of it being
# swallowed by the intermediate `sh` process.
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node server.js"]
