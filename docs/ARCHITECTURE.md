# Архитектура Commrent / ArendaPro

Документ описывает фактическую архитектуру SaaS-платформы для управления коммерческой арендой.

## Stack

| Слой | Технология | Версия (`package.json`) |
| --- | --- | --- |
| Web framework | Next.js (App Router, RSC, Server Actions) | `next@16.2.4` |
| Runtime React | React + React-DOM | `19.2.4` |
| ORM | Prisma + Postgres-адаптер | `prisma@^7.8.0`, `@prisma/adapter-pg@^7.8.0` |
| База данных | PostgreSQL (Supabase) | через `pg@^8.20.0` |
| Auth | NextAuth v5 (Credentials + JWT) | `next-auth@^5.0.0-beta.31` |
| Стили | TailwindCSS 4 (PostCSS) | `tailwindcss@^4` |
| Mobile | Expo + Expo Router | `expo@~54`, `expo-router@~6` (`mobile/package.json`) |
| Email | Resend | `resend@^6.12.2` |
| Документы (DOCX) | docx + docxtemplater + pizzip | — |
| Observability | Sentry (Next + RN) | `@sentry/nextjs@^10.51.0`, `@sentry/react-native@~7.2` |
| 2FA | TOTP (otpauth) | `otpauth@^9.5.1` |

## Multi-tenant модель данных

Иерархия из `prisma/schema.prisma`:

```
Organization               (id, slug, plan, isActive, isSuspended, ...)
   └── Building            (organizationId)
        └── Floor          (buildingId, ratePerSqm, fixedMonthlyRent)
             └── Space     (floorId, area, number)
                  └── Tenant (spaceId | tenantSpaces[] | fullFloors[])

Tenant финансы:
   Tenant ── Charge[]      (period YYYY-MM, type RENT/CLEANING/UTILITIES/...)
          ── Payment[]     (method KASPI/CASH/BANK, externalRef для идемпотентности)
          ── Contract[]    (с addendum)
          ── Request[]     (заявки на ремонт/обслуживание)

Org-уровневые сущности:
   Organization ── User[], ApiKey[], CashAccount[], Subscription[], Plan
```

Арендатор может быть привязан четырьмя путями (`lib/tenant-scope.ts:48-59`): к `Space`, к нескольким Space через `tenantSpaces`, к целому `Floor` через `fullFloors`, либо только через `user.organizationId` (свежесозданный без помещения).

## Auth flow

1. Пользователь открывает `commrent.kz/login` (root host).
2. `auth.ts` (NextAuth Credentials) ищет пользователя по `phone`/`email` (см. `getLoginIdentifiers` в `lib/contact-validation.ts`), сравнивает bcrypt-хеш пароля и проверяет `approvalStatus`/`org.isSuspended` (`lib/approval.ts`).
3. Если у пользователя включён TOTP (`totpEnabledAt`) — обязателен 6-значный код; без него `authorize` бросает `TOTP_REQUIRED` (`auth.ts:116-128`).
4. После успеха ставится session-cookie `__Secure-commrent.session-token` с `Domain=.${ROOT_HOST}` (`auth.ts:14-22, 169-181`) — это позволяет выполнить редирект `commrent.kz` → `slug.commrent.kz` без потери сессии.
5. Маршрутизация по роли (см. `proxy.ts`):

```
                           ┌── isPlatformOwner ──→ /superadmin
                           │
login → set cookie ────────┼── role = TENANT     ──→ /cabinet
                           │
                           └── OWNER/ADMIN/...   ──→ /admin
```

## Изоляция организаций (3 уровня)

1. **Cookie:** `Domain=.commrent.kz`, чтобы один и тот же session-cookie видел и root, и любой `slug.commrent.kz`. Безопасность держится не на cookie-домене, а на следующих двух уровнях.
2. **Host-routing (`proxy.ts`):** middleware парсит `Host`, классифицирует через `parseHost` (`lib/host.ts`) на `root | subdomain | reserved | invalid | external`. На `slug.commrent.kz` разрешены только `/admin`, `/cabinet`, `/superadmin`, `/api`, статика (`proxy.ts:94-120`). В заголовки запроса добавляется `x-org-host-kind` и `x-org-slug` (`proxy.ts:178-184`).
3. **App-level scope:**
   - `requireOrgAccess()` (`lib/org.ts:119-164`) проверяет, что `user.organizationId` совпадает со slug в URL (флаг `ENFORCE_SUBDOMAIN`), что организация активна и не приостановлена. Обёрнут в `React cache()` для дедупликации внутри одного RSC-render.
   - `lib/tenant-scope.ts` экспортирует фабрики `tenantScope/chargeScope/paymentScope/...` — каждая возвращает Prisma-`where`, ограниченный текущей `organizationId`. Если `orgId` пустой — возвращается `{ id: "__never__" }`, чтобы запрос вернул пустой результат вместо случайной утечки. Также фильтруют `deletedAt: null` (миграция 019, soft delete).

## Capability-based permissions

Помимо ролей (`OWNER`, `ADMIN`, `ACCOUNTANT`, `FACILITY_MANAGER`, `STAFF`, `TENANT`, `PLATFORM_OWNER`) есть тонкие capabilities:

- `lib/capabilities.ts` — список `ACTION_CAPABILITY_GROUPS` (приглашение пользователей, создание зданий, sensitive-операции и т. д.) с метаданными `level: view|edit|sensitive`, `risk: normal|business|sensitive`, `requiredFeature` (привязка к плану).
- `lib/role-capabilities.ts` — мэппинг «роль → разрешённые capability keys».
- `lib/plan-capabilities.ts` + `lib/plan-features.ts` — проверка по plan.features (JSON в БД).
- `lib/acl.ts` — секции (`SECTIONS`) и хелперы `canView/canEdit/fallbackCanView` (используется для секционного доступа в `/admin`).

`requireFeature(orgId, key)` и `checkLimit(orgId, type)` (`lib/org.ts:321-354`) кидают понятные ошибки при попытке использовать недоступную фичу или превысить лимит плана (`maxBuildings`, `maxTenants`, `maxUsers`, `maxLeads`).

## Cron jobs

Список из `vercel.json`:

| Path | Schedule (UTC) | Назначение |
| --- | --- | --- |
| `/api/cron/check-deadlines` | `0 5 * * *` | Сканирует Charge/Contract на просрочки, шлёт уведомления |
| `/api/cron/monthly-invoices` | `0 4 1 * *` | 1-го числа создаёт `RENT/CLEANING` Charge для активных арендаторов (`app/api/cron/monthly-invoices/route.ts`) |
| `/api/cron/check-subscriptions` | `0 2 * * *` | Истекшие подписки → `isSuspended=true` |

Каждый эндпоинт защищён через `authorizeCronRequest` (`lib/cron-auth.ts`): обязательный `Authorization: Bearer ${CRON_SECRET}`, `timingSafeEqual` сравнение. Vercel Cron автоматически добавляет этот заголовок на запланированных запусках.

## Кеширование

- `lib/admin-shell-cache.ts` — `unstable_cache` с тегами для часто запрашиваемых данных:
  - `getCachedAdminShellOrg` (revalidate 60s, tag `admin-shell`)
  - `getCachedAdminShellBuildings`, `getCachedAdminShellSections`, `getCachedAdminShellCapabilities`
  - `getCachedBuildingsForOrg(orgId)`, `getCachedFloorsForBuilding(buildingId)` — фабрики, которые подставляют per-tenant ключи и теги (`buildings:${orgId}`).
  - `getCachedUnreadNotificationCount` (revalidate 10s).
- `React cache()` оборачивает `getCurrentOrgId` и `requireOrgAccess` (`lib/org.ts`) — это within-request деупликация для ситуаций, когда layout, page и breadcrumb независимо запрашивают тот же контекст.

## Мобильное приложение

- `mobile/` — Expo (Expo Router 6, RN 0.81). Билды через EAS (`mobile/eas.json`).
- API для мобильного — `app/api/mobile/*` (auth, bootstrap, owner, tenant, admin, push-devices, security и т. д.).
- Сессия: access-token 15 минут, refresh-token 30 дней (`lib/mobile-auth.ts:7-8`). Refresh — по `POST /api/mobile/auth/refresh` (`app/api/mobile/auth/refresh/route.ts`).

## Деплой и миграции

- `npm run build` запускает `node scripts/deploy-migrations.mjs && prisma generate && next build` (`package.json:7`). Это значит, что миграции применяются *перед* каждой production-сборкой (Vercel build).
- `scripts/deploy-migrations.mjs` запускает `prisma migrate deploy`, затем последовательно применяет `customSqlPatches` из `migrations/*.sql` (на момент написания: `013_mobile_foundation.sql` … `019_soft_delete.sql`). При наличии `DIRECT_URL` использует прямое подключение (порт 5432), иначе апгрейдит pooler URL `:6543` → `:5432` (`scripts/deploy-migrations.mjs:37-54`).
- Skip-флаги: `SKIP_DEPLOY_MIGRATIONS=1`, `FORCE_DEPLOY_MIGRATIONS=1`.

## Observability

- Sentry: `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`, `instrumentation.ts`. PII (email, IP, токены, заголовки) обезличивается в `lib/sentry-sanitize.ts` через `beforeSend`. Серверные обёртки — `lib/sentry-server.ts`.
- Health-эндпоинты: `/api/health`, `/api/health/db` (тестирует SELECT 1, версию Postgres, наличие таблиц/колонок), `/api/health/isolation`.

## Security headers

`next.config.ts:15-36` ставит для всех путей `Strict-Transport-Security` (2 года, `includeSubDomains; preload`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. CSP пока не настроен (требует nonce-стратегии для inline-скриптов Next и Sentry).
