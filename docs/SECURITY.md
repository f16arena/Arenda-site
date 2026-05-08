# Security

Документ описывает модель угроз многоарендной (multi-tenant) SaaS-платформы Commrent и фактические мер защиты.

## Threat model

Главные угрозы:

1. **Tenant isolation breach** — организация A видит/редактирует данные организации B. Самый критичный сценарий для SaaS.
2. **Auth & session** — brute-force логина, session hijack, повторное использование токенов.
3. **Data integrity** — случайное удаление, race conditions, невалидные финансовые данные.
4. **Secrets leakage** — экспозиция `AUTH_SECRET`, `CRON_SECRET`, `SETUP_SECRET`, токенов API-ключей.
5. **Privilege escalation** — обычный пользователь получает права OWNER/PLATFORM_OWNER через подмену cookie/token.

## Mitigations

### Tenant isolation

- **Cookie + хост-роутинг**: session-cookie стоит на `Domain=.commrent.kz` (`auth.ts:14-22`), но это только UX-слой. Реальная изоляция — на app-level.
- **`requireOrgAccess()` (`lib/org.ts:119-164`)**: проверяет, что `user.organizationId` совпадает с slug в URL (флаг `ENFORCE_SUBDOMAIN`), что организация активна и не приостановлена. Платформенный админ исключён (он работает с любой организацией через impersonate).
- **`lib/tenant-scope.ts`**: `tenantScope/chargeScope/paymentScope/...` — централизованные фабрики `where`-фрагментов для Prisma. Если `orgId` пустой, возвращают `{ id: "__never__" }` — это явный fail-closed default.
- **Audit script**: `npm run security:audit` (`scripts/security-isolation-audit.mjs`) ищет вызовы Prisma без orgScope.
- **E2E isolation**: `npm run test:e2e:isolation` (`scripts/e2e-isolation.ts`) поднимает две организации и проверяет, что queries A не видят данные B.
- **Soft delete**: `deletedAt: null` в фабриках scope (миграция `019_soft_delete.sql`) — удалённые записи не появляются в выборках.
- **Postgres RLS**: на public-таблицах включены deny-by-default policies, grants для `anon`/`authenticated` отозваны (см. `migrations/003_rls_policies.sql`, проверки в `/admin/system-health`).

### Auth & session

- **Bcrypt + timing-safe**: пароли хранятся в `bcryptjs`, сравнение через `bcrypt.compare`. `CRON_SECRET`, `SETUP_SECRET`, impersonate-cookie сравниваются через `crypto.timingSafeEqual` (`lib/cron-auth.ts`, `app/api/setup/route.ts`, `lib/org.ts:241-252`).
- **TOTP 2FA**: `otpauth`. Включается в профиле пользователя, при логине обязателен 6-значный код. Резервные коды хранятся в виде хешей (`User.totpBackupCodes`, `auth.ts:116-128`).
- **Mobile rate-limit**: `lib/mobile-rate-limit.ts` ограничивает попытки login по `ip:login`. После N неудач — 429 с `Retry-After`.
- **Web rate-limit**: `lib/rate-limit.ts` (in-memory bucket) — на login, signup, `/api/setup`, `/api/v1/*`, `/api/kaspi/webhook` и т. д. На Vercel при горизонтальном масштабе каждый instance считает независимо — это «достаточная» защита, но не защита от ботнетов; для серьёзных rate-limits нужен Redis/Upstash.
- **Force password change**: `User.mustChangePassword` (миграция 015). При первом входе пользователь обязан задать собственный пароль; пока не задал — заблокирован на странице `/change-password` (`proxy.ts:22-25`).
- **Approval workflow**: `lib/approval.ts` блокирует логин, пока пользователь/организация не подтверждены (`approvalStatus`).
- **Impersonate**: HMAC-подписанный cookie с TTL 8 часов, проверка `realUserId` совпадает с current session (`lib/org.ts:181-205`). Только `isPlatformOwner` может включить.

### Data integrity

- **Soft delete**: Tenant, Charge, Payment, Contract, GeneratedDocument помечаются `deletedAt`, не удаляются физически (миграция 019). Восстановление через админку.
- **Idempotency**: Kaspi-webhook обрабатывает только `payment.externalRef` — повторный вебхук не создаёт дубликат (`app/api/kaspi/webhook/route.ts:38-44`).
- **Audit log**: `lib/audit.ts` пишет критичные действия в `audit_logs` (создание/удаление пользователей, изменения договоров, ручные платежи и т. д.). Просмотр — `/admin/audit`. Попытки входа с неверным паролем тоже логируются (`auth.ts:73-101`).
- **Confirmation на критичных действиях**: удаление, отмена счёта, разрыв договора требуют подтверждения в UI.

### Secrets

- `.env.example` — публичный шаблон (значения пустые).
- `lib/sentry-sanitize.ts`: `beforeSend` удаляет PII (email, IP, заголовки `Authorization|Cookie|API-Key|Session`) до отправки в Sentry.
- `SETUP_ENABLED=false` по умолчанию в production — `/api/setup` 403, даже если кто-то знает `SETUP_SECRET`.
- API-токены: только bcrypt-хеш + первые 8 символов prefix; plain-токен показывается ровно один раз при создании (`lib/api-keys.ts:25-30`). Отзыв через `revokedAt`.

### Security headers

`next.config.ts:15-36` добавляет на все ответы:
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` (2 года, готовность к HSTS preload-list).
- `X-Frame-Options: DENY` — нет clickjacking.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

## Что не сделано (открытые задачи)

- **CSP (Content Security Policy)** — требует nonce-стратегии для inline-скриптов Next и Sentry, не настроен (явно отмечено в комментарии `next.config.ts:14`).
- **Pen-test** — не проводился; перед публичным релизом желательно внешний аудит.
- **Prisma extension для глобального soft-delete фильтра** — сейчас `deletedAt: null` ставится в каждой `*Scope`-фабрике вручную; забыть его в новом scope = утечка удалённых записей.
- **Distributed rate-limit** — текущая реализация in-memory (`lib/rate-limit.ts`); при росте инстансов на Vercel ослабляется.
- **API ключи без WRITE-операций** — `app/api/v1/*` сейчас только `READ`, что снимает класс рисков ИЗ инжектов через интеграции, но WRITE-эндпоинты, когда появятся, потребуют ревизии RBAC.
- **Field-level encryption** для чувствительных полей (банковские реквизиты, паспорта) — не реализовано.

## Reporting vulnerabilities

Найдена уязвимость? Пожалуйста, не публикуйте детали в публичных issue. Свяжитесь по адресу `security@commrent.kz` *(адрес — placeholder; уточнить у владельца проекта перед публикацией)*. Мы стараемся подтверждать получение в течение 48 часов и фиксить критичные баги в течение 7 дней.
