# Развертывание

Пошаговая инструкция, как поднять Commrent с нуля на Vercel + Supabase.

## Prerequisites

- Node.js 20+ (`@types/node@^20`).
- Аккаунт [Supabase](https://supabase.com) для Postgres.
- Аккаунт [Vercel](https://vercel.com) с подключенным GitHub-репозиторием.
- Домен с возможностью настройки wildcard DNS (`*.commrent.kz` или ваш аналог).
- Опционально: аккаунт Resend (письма), Sentry (errors), Telegram Bot, Kaspi Business (для webhook).

## 1. Supabase

1. Создайте новый проект, выберите регион поближе к Vercel deployment (Europe / Asia).
2. В Project Settings → Database скопируйте две строки подключения:
   - **Transaction Pooler** (`...@aws-0-...pooler.supabase.com:6543`) — это `DATABASE_URL` для рантайма.
   - **Direct connection** (`...:5432`) — это `DIRECT_URL` для миграций (опционально, скрипт сам апгрейдит pooler-URL до 5432, если `DIRECT_URL` не задан, см. `scripts/deploy-migrations.mjs:37-54`).
3. PITR-бэкапы в Supabase включены автоматически на платных планах.

Применять миграции локально вручную обычно не нужно — это сделает `npm run build` (см. шаг 5). При желании:

```bash
node scripts/deploy-migrations.mjs
```

Скрипт прогонит `prisma migrate deploy`, потом по очереди применит SQL-патчи из `migrations/*.sql` (список — массив `customSqlPatches` в `scripts/deploy-migrations.mjs:11-19`).

## 2. Vercel: переменные окружения

Минимально необходимые (полный список — `.env.example`):

| Переменная | Назначение |
| --- | --- |
| `DATABASE_URL` | Pooler-URL Supabase (порт 6543). |
| `DIRECT_URL` | (опц.) Прямой URL для миграций. |
| `AUTH_SECRET` | Секрет NextAuth. Сгенерировать: `openssl rand -base64 32`. |
| `NEXTAUTH_URL` | `https://commrent.kz`. |
| `ROOT_HOST` | `commrent.kz` (домен без схемы — нужен для cookie-домена `.commrent.kz`, см. `auth.ts:14-22`). |
| `ENFORCE_SUBDOMAIN` | `true` после полной настройки DNS на `*.commrent.kz`. До этого — `false`/не задана (тогда `/admin` доступен и на root, иначе сломается логин до настройки поддоменов). |
| `SETUP_SECRET` | Случайный 32+ символ. |
| `SETUP_ENABLED` | `false` по умолчанию; ставится в `true` только на момент `/api/setup`, потом возвращается к `false`. |
| `CRON_SECRET` | Секрет для Vercel Cron. Vercel автоматически прокидывает `Authorization: Bearer ${CRON_SECRET}`. |
| `RESEND_API_KEY` | Ключ Resend для писем. |
| `EMAIL_FROM` | `Commrent <noreply@commrent.kz>`. |
| `KASPI_*` | См. `.env.example` — Kaspi отключается, если не заданы. |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` | Server и browser DSN. |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Для upload source maps в build. |
| `SENTRY_TRACES_SAMPLE_RATE` | По умолчанию `0.05`. Не выше `0.1` — quota. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Telegram-бот (опционально). |
| `EXPO_PUBLIC_API_BASE_URL` | URL продакшен-API для мобильного приложения (`https://commrent.kz`). |

## 3. DNS

В DNS-провайдере добавьте:

```
A      commrent.kz          76.76.21.21         (или CNAME на vercel-dns.com)
CNAME  www.commrent.kz      cname.vercel-dns.com
CNAME  *.commrent.kz        cname.vercel-dns.com
```

В Vercel → Project → Settings → Domains добавьте оба домена (`commrent.kz` и `*.commrent.kz`). Wildcard нужен для slug-поддоменов организаций (`bcf16.commrent.kz`).

Зарезервированные слаги (на которые нельзя зарегистрироваться) перечислены в `lib/reserved-slugs.ts` и проверяются `parseHost` (`lib/host.ts`).

## 4. Деплой

Push в `main` → Vercel автоматически собирает.

```bash
# package.json:7
build: node scripts/deploy-migrations.mjs && prisma generate && next build
```

Это значит, что миграции применяются *до* билда. При первом деплое: на чистой БД пройдут все `prisma migrate deploy` + custom SQL патчи.

## 5. Initial setup

После первого успешного деплоя нужно создать платформенного админа и базовые данные:

1. Установите `SETUP_ENABLED=true` в Vercel env, перезапустите деплой.
2. Выполните:
   ```bash
   curl -X POST "https://commrent.kz/api/setup?secret=$SETUP_SECRET" \
        -H "Origin: https://commrent.kz"
   ```
3. Проверьте, что админ создан, и **немедленно** уберите `SETUP_ENABLED` (или поставьте `false`). Эндпоинт затем будет отвечать `403 Setup disabled`.

## 6. Smoke test

```bash
curl https://commrent.kz/api/health        # должен вернуть {"ok":true,...}
curl https://commrent.kz/api/health/db     # подробная диагностика БД
```

В админке `/admin/system-health` есть полный отчёт: env, БД, email, RLS/grants, sitemap/robots.

## 7. Mobile (EAS)

```bash
cd mobile
npm ci
npx eas-cli@latest login
npx eas-cli@latest build:configure
```

В `mobile/eas.json` уже настроены профили `preview` и `production`. Скрипты в `mobile/package.json`:

```bash
npm run build:android:preview      # тест-сборка APK (preview)
npm run build:ios:preview          # iOS Simulator/Internal
npm run build:android:production   # AAB для Google Play
npm run build:ios:production       # IPA для App Store
npm run submit:android:internal    # внутренний трек Google Play
npm run submit:ios:testflight      # TestFlight
```

Перед сборкой убедитесь, что `EXPO_PUBLIC_API_BASE_URL` в env указывает на production-домен.

## Troubleshooting

**Логин с `commrent.kz` не редиректит на `slug.commrent.kz`.**
Проверьте `ROOT_HOST`. Если он не задан, cookie не получает `Domain=.commrent.kz` и теряется при переходе на поддомен (`auth.ts:14-22`).

**Subdomain отдаёт 404 или редиректит на root.**
- Проверьте, что слаг существует в `Organization.slug`.
- Проверьте, что вы не наткнулись на reserved subdomain (`api.`, `admin.`, `www.`, ... — см. `lib/host.ts`, `lib/reserved-slugs.ts`).
- Проверьте wildcard DNS.

**Prisma жалуется при build: `relation "..." does not exist`.**
Миграции не успели накатиться. Проверьте логи Vercel build — `scripts/deploy-migrations.mjs` должен залогировать применение каждого SQL-патча. Если в Vercel переменные `CI=true` + `SKIP_DEPLOY_MIGRATIONS=1`, скрипт пропустит миграции (см. `scripts/deploy-migrations.mjs:72-80`).

**`/api/cron/*` возвращают 403.**
`CRON_SECRET` не задан или не совпадает. Vercel Cron подставляет заголовок автоматически из env, ручные запросы тоже должны слать `Authorization: Bearer ${CRON_SECRET}` (`lib/cron-auth.ts:7-15`).

**`/api/setup` отвечает `SETUP_SECRET не настроен либо слишком короткий`.**
Установите `SETUP_SECRET` минимум 32 символа (`app/api/setup/route.ts:42-48`).

**Mobile login: `Too many login attempts`.**
В `lib/mobile-rate-limit.ts` ключ — `ip:login` (lowercase). Подождите указанное `Retry-After`, либо явно очистите bucket из дев-консоли (рестарт инстанса).
