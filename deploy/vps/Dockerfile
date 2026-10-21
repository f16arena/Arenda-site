# Commrent — образ для VPS (cloud-001). Обычный `next start`, без output: standalone,
# чтобы не трогать next.config и не ломать деплой на Vercel.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tzdata \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY scripts/copy-pdf-worker.mjs ./scripts/copy-pdf-worker.mjs
RUN mkdir -p public && npm ci --no-audit --no-fund

COPY . .

# NEXT_PUBLIC_* вшиваются в клиентский бандл на этапе сборки.
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_TELEGRAM_BOT_NAME
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_TELEGRAM_BOT_NAME=$NEXT_PUBLIC_TELEGRAM_BOT_NAME \
    NODE_OPTIONS=--max-old-space-size=6144

# Миграции НЕ здесь (на Vercel они шли в `npm run build`): на VPS их гоняет deploy.sh
# отдельным шагом перед перезапуском, против живой БД.
RUN npx prisma generate && npx next build

ENV NODE_ENV=production NODE_OPTIONS= PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
