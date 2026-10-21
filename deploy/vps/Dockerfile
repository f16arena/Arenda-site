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
# То, что на Vercel платформа делала сама:
# - DEPLOYMENT_VERSION -> deploymentId (next.config): вкладка, открытая до деплоя, при переходе
#   перезагружается целиком, а не падает на исчезнувших чанках/Server Actions (version skew).
#   Нужен и при сборке, и при запуске — next.config читается в обоих случаях;
# - NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: один ключ на все сборки (только на этапе сборки, в образ
#   не попадает), иначе замыкания Server Actions со страниц, открытых до деплоя, не расшифровываются;
# - GIT_COMMIT_SHA -> lib/release.ts и релиз Sentry.
ARG DEPLOYMENT_VERSION
ARG GIT_COMMIT_SHA
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_TELEGRAM_BOT_NAME=$NEXT_PUBLIC_TELEGRAM_BOT_NAME \
    DEPLOYMENT_VERSION=$DEPLOYMENT_VERSION \
    GIT_COMMIT_SHA=$GIT_COMMIT_SHA \
    SENTRY_RELEASE=$GIT_COMMIT_SHA \
    NODE_OPTIONS=--max-old-space-size=6144

# Миграции НЕ здесь (на Vercel они шли в `npm run build`): на VPS их гоняет deploy-server.sh
# отдельным шагом перед перезапуском, против живой БД.
RUN npx prisma generate && npx next build

ENV NODE_ENV=production NODE_OPTIONS= PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000
# node напрямую, не npx: npm exec плохо передаёт SIGTERM, и при деплое Docker через 10 с убивал
# Next жёстко, обрывая запросы. Сигналы ловит init (compose: init: true).
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
