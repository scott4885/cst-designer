FROM node:20-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:20-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y python3 make g++ openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/tmp/seed.db
# Schema is present now — compile native modules and generate prisma client
RUN npm rebuild better-sqlite3
RUN npx prisma generate
RUN npx prisma migrate deploy
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/app/data/schedules.db
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Copy full node_modules so prisma CLI + deps exist at runtime for migrations
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /tmp/seed.db /app/seed.db
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma
RUN mkdir -p /app/data
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# On startup: seed DB if new, run migrations to apply schema changes, then start
CMD ["sh", "-c", "[ ! -f /app/data/schedules.db ] && cp /app/seed.db /app/data/schedules.db; DATABASE_URL=file:/app/data/schedules.db ./node_modules/.bin/prisma migrate deploy --schema /app/prisma/schema.prisma 2>&1 || true; node server.js"]
