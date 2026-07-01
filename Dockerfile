# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app

# ---- Dependencies for the build (includes devDependencies) ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm install

# ---- Build the Next.js app ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Production-only dependencies (full install, no tracing gaps) ----
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm install --omit=dev

# ---- Final runtime image ----
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 -G nodejs

# Full production node_modules (covers both `next start`'s standalone
# server and scripts/migrate.mjs, which next's output tracing wouldn't
# otherwise pick up since it isn't imported by the app itself).
COPY --from=prod-deps /app/node_modules ./node_modules

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone/server.js ./server.js
COPY --from=builder /app/.next/standalone/.next ./.next
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts/migrate.mjs ./scripts/migrate.mjs

RUN chown -R nextjs:nodejs /app
USER nextjs

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
