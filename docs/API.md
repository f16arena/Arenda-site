# API

Документ описывает фактически реализованные публичные и интеграционные эндпоинты Commrent. Все ответы — JSON; кодировка UTF-8.

## REST API для интеграторов (1С, Excel-скрипты)

Базовый URL: `https://commrent.kz` (или ваш `ROOT_HOST`).

### Авторизация

Bearer-токен, привязанный к `ApiKey` организации. Создаётся в админке (`/admin/api-keys`); поддерживает scope `READ` и `WRITE`. Токен показывается ровно один раз — потом хранится только bcrypt-хеш + первые 8 символов префикса (`lib/api-keys.ts:26-30, 49-77`).

Передача токена — на выбор:

```http
GET /api/v1/charges?period=2026-04 HTTP/1.1
Host: commrent.kz
Authorization: Bearer ck_xxxxxxxxxxxxxxxxxxxxxxxx
```

или query-параметром `?api_key=ck_...` (для случаев, когда нет возможности задать заголовок).

При успешной аутентификации `ApiKey.lastUsedAt` обновляется асинхронно. Просроченные (`expiresAt < now`) и отозванные (`revokedAt is not null`) ключи отклоняются.

### `GET /api/v1/charges`

Источник: `app/api/v1/charges/route.ts`.

Параметры:

| Параметр | Тип | По умолчанию | Описание |
| --- | --- | --- | --- |
| `period` | `YYYY-MM` | — | Только начисления конкретного месяца. Регэкс `^\d{4}-(0[1-9]|1[0-2])$`. |
| `unpaid` | `true|false` | — | Только неоплаченные (`isPaid=false`). |
| `tenantId` | string | — | Конкретный арендатор. |
| `limit` | int 1..500 | 100 | Размер страницы. |
| `offset` | int >= 0 | 0 | Смещение. |

Ответ:

```json
{
  "data": [
    {
      "id": "...",
      "tenantId": "...",
      "period": "2026-04",
      "type": "RENT",
      "amount": 350000,
      "isPaid": false,
      "dueDate": "2026-04-25T00:00:00.000Z",
      "createdAt": "2026-04-01T04:00:12.000Z",
      "tenant": { "companyName": "ТОО Пример" }
    }
  ],
  "pagination": { "total": 248, "limit": 100, "offset": 0, "hasMore": true }
}
```

Изоляция гарантируется `chargeScope(orgId)` (`lib/tenant-scope.ts:62-65`).

### `GET /api/v1/tenants`

Источник: `app/api/v1/tenants/route.ts`.

| Параметр | Тип | По умолчанию | Описание |
| --- | --- | --- | --- |
| `limit` | int 1..500 | 100 | |
| `offset` | int >= 0 | 0 | |
| `blacklisted` | `true|false` | — | Фильтр по `blacklistedAt`. |

Ответ — массив объектов с полями `id, companyName, legalType, bin, iin, bankName, iik, bik, contractStart, contractEnd, createdAt, blacklistedAt, user{name,email,phone}, space{number,area,floor{name,building{name,address}}}` плюс `pagination`.

### Rate limits

100 запросов в минуту на ключ (`apikey:${apiKeyId}`), реализовано через in-memory bucket в `lib/rate-limit.ts`. При превышении возвращается:

```http
HTTP/1.1 429 Too Many Requests
{ "error": "Rate limit. Try in 42s." }
```

Замечание: rate-limit in-memory — на Vercel при горизонтальном масштабе каждый instance считает независимо (см. комментарий в `lib/rate-limit.ts:1-9`).

### Коды ошибок

| Код | Причина |
| --- | --- |
| 400 | Невалидный JSON / некорректные параметры |
| 401 | Нет или некорректный токен (`ApiKeyError`) |
| 403 | Токен есть, но scope недостаточен (например, нужен `WRITE`, а ключ `READ`) |
| 429 | Rate limit |
| 500 | Внутренняя ошибка |

Эндпоинтов на `WRITE` в `app/api/v1/` пока нет — текущий API только `READ`. Добавление WRITE-операций требует уточнения у команды.

## Webhooks

### `POST /api/kaspi/webhook`

Источник: `app/api/kaspi/webhook/route.ts`. Принимает уведомления о входящем платеже от Kaspi Pay.

- Подпись: HMAC в заголовке `x-kaspi-signature`, проверяется `verifyKaspiWebhookSignature` (`lib/kaspi.ts`). Без валидной подписи — 401.
- Идемпотентность: по `payment.externalRef = payload.txnId`. Повторный вебхук с тем же `txnId` возвращает `{ ok: true, duplicate: true }`.
- Сопоставление с арендатором: либо по `reference` формата `tenant:<id>` / `charge:<id>`, либо по БИН плательщика. Не распознанные платежи логируются и возвращают `{ ok: true, matched: false }` (Kaspi не ретраит).
- Rate-limit: 60 webhook/мин на IP.
- Конфигурация: `KASPI_WEBHOOK_SECRET`, `KASPI_TRADE_POINT_ID`, `KASPI_API_KEY`, `KASPI_API_BASE_URL` (см. `.env.example`). Если они не заданы — Kaspi-интеграция отключена.

### `POST /api/telegram/webhook`

Источник: `app/api/telegram/webhook/route.ts`. Обрабатывает входящие сообщения Telegram-бота. Защищён заголовком `x-telegram-bot-api-secret-token`, который сверяется с `TELEGRAM_WEBHOOK_SECRET` (если задан в env).

Регистрация webhook у Telegram — через служебный эндпоинт `/api/telegram/setup`.

## Mobile API

`app/api/mobile/*` — приватный API для собственного Expo-приложения, не предназначен для внешней интеграции (Bearer-токен мобильного приложения != ApiKey).

Поток аутентификации (`lib/mobile-auth.ts`):

1. `POST /api/mobile/auth/login` — `{ login, password, totp?, deviceId?, deviceName?, platform?, appVersion? }`. Ответ: `{ user, tokens: { accessToken, refreshToken } }`. TTL access-token — 15 минут, refresh — 30 дней (`lib/mobile-auth.ts:7-8`).
2. `POST /api/mobile/auth/refresh` — `{ refreshToken }`. Возвращает новую пару токенов; старый refresh ротируется.
3. `POST /api/mobile/auth/logout` — отзывает refresh.
4. `GET /api/mobile/auth/me` — текущий пользователь.

Rate-limit: `lib/mobile-rate-limit.ts` отслеживает попытки по ключу `${ip}:${login}` (см. `app/api/mobile/auth/login/route.ts:75-79`). Превышение — `429 RATE_LIMITED` с `Retry-After`.

Доменные эндпоинты:

- `GET /api/mobile/bootstrap` — стартовый агрегат (контекст пользователя, доступные здания, счётчики уведомлений/устройств/подписей/уведомлений-объявлений).
- `app/api/mobile/admin/*` — `today`, `buildings`, `tenants`, `contracts`, `documents`, `payment-reports`, `requests`.
- `app/api/mobile/tenant/*` — `overview`, `finances`, `contracts`, `documents`, `requests`, `meters`, `messages`.
- `app/api/mobile/owner/*`, `app/api/mobile/security/*`, `app/api/mobile/notifications/*`.
- `POST /api/mobile/push-devices` — регистрация Expo push-token.

Все мобильные эндпоинты получают `OrgContext` через `getMobileContext(req)` (`lib/mobile-context.ts`), которая разворачивает Bearer-token и извлекает пользователя/организацию.

## Health

| Endpoint | Описание |
| --- | --- |
| `GET /api/health` | Сводный health-check; деталями делится только с `OWNER/ADMIN/PLATFORM_OWNER` (`app/api/health/route.ts:13`). Возвращает 503 при ошибках. |
| `GET /api/health/db` | Подробный диагностический отчёт по БД: SELECT 1, версия Postgres, счётчики таблиц, проверка наличия требуемых таблиц/колонок свежей схемы. Без авторизации (по дизайну — для удалённой диагностики). |
| `GET /api/health/isolation` | Аудит RLS/grants. |

## Setup

`POST /api/setup?secret=...` — одноразовая инициализация БД. В production отключён по умолчанию: требует `SETUP_ENABLED=true` + `SETUP_SECRET` длиной ≥ 32 символа. Rate-limit 3 попытки/час на IP, CSRF-проверка по `Origin/Host`, constant-time сравнение секрета (`app/api/setup/route.ts:14-60`). После использования флаг `SETUP_ENABLED` нужно убрать.
