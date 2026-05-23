# Переезд Vercel → VPS: вводные, решения, план

> Черновик-памятка. Обсуждение приостановлено — вернёмся позже.
> Дата фиксации: 2026-05-22.

## Решения (приняты)

- **БД:** остаётся на Supabase **во Франкфурте** (managed, не трогаем).
- **VPS:** ставим **во Франкфурте рядом с БД** (вариант A). «Сервер в КЗ» НЕ делаем — он бы замедлил из-за latency app↔DB.
- **Cloudflare** спереди — да (КЗ-край, wildcard-TLS, кеш публички, гасит рост трафика).
- **Бюджет:** VPS Basic-3 (~14 450 тг/мес).
- **Downtime:** 10–60 мин при cutover допустим.
- **Приоритеты:** скорость для КЗ + независимость от вендора + снижение цены.

## Факты по стеку (из кода)

| Вопрос | Ответ |
|---|---|
| Фреймворк | Next.js **16.2.4**, React 19.2.4, **App Router** (`/app`) |
| Middleware | `proxy.ts` (так зовётся в Next 16) |
| Мультитенантность | Вариант (a): wildcard `*.commrent.kz` → 1 проект → `proxy.ts` резолвит slug из Host, прокидывает `x-org-slug` |
| API routes | **75** `route.ts` в `/app/api` + server actions. НЕ «Supabase с клиента» |
| БД | **Supabase Postgres (Франкфурт)**, через Prisma 7 + `@prisma/adapter-pg`. Без supabase-js |
| Auth | **Auth.js / NextAuth v5**, Credentials (bcrypt) + 2FA TOTP, JWT. Кука `domain=.commrent.kz` (шарится между поддоменами). `/login` только на корне |
| Файлы | В самой Postgres как `Bytes` (StoredFile/шаблоны/архив). Без Supabase Storage / Vercel Blob / S3 |
| Создание орги | Просто запись в БД (Organization+slug). Vercel Domains API НЕ используется |
| `@vercel/og` | нет |
| `@vercel/blob` / `kv` | нет |
| Vercel Cron | **да, 5**: check-deadlines, monthly-invoices, check-subscriptions, payment-reminders, warm |
| Edge Functions / Runtime | нет (всё Node.js) |
| ISR / `revalidate` | нет (динамика + `unstable_cache` с тегами) |
| Analytics / Speed Insights | нет (свой `/api/web-vitals` + Sentry) |
| Репозиторий | GitHub `f16arena/Arenda-site`, монорепо: `arenda-pro` (веб) + `mobile` (Expo) |
| Env-переменные | ~25–30 (`.env.example` = 26) |
| Cron-авторизация | `Authorization: Bearer $CRON_SECRET` (см. `lib/cron-auth.ts`) — как у Vercel Cron |

## Бизнес-вводные (со слов пользователя)

- Организаций: **>100 в год**.
- Трафик публички: **~100k/день — прогноз на год** (не текущий).
- Сайты `syne-tex.kz`, `syne-tix.tech`, `turanix.kz`: **переезжать не надо**, в этом репо их нет.

## Архитектура (итог)

```
Пользователь (КЗ) ──► Cloudflare (POP Алматы): кеш публички, wildcard-TLS, DDoS
                         ▼
                    VPS Франкфурт: Caddy/nginx → next start (Node-процесс)
                         ▼
                    Supabase Postgres (Франкфурт, рядом ~1–5 мс)
```

## Что меняется при переезде

- **Cron:** убрать зависимость от Vercel-планировщика; 5 системных таймеров (systemd/crontab) дёргают `/api/cron/*` с `Authorization: Bearer $CRON_SECRET`. Код роутов не трогаем.
- **`warm`-cron можно удалить:** холодных стартов на постоянном Node-процессе нет (на Vercel TTFB до 13 с / `/superadmin` ~9.7 с — артефакт serverless). Прямой выигрыш по скорости от переезда.
- **Env:** перенести как есть. `AUTH_SECRET` — ТОТ ЖЕ (иначе все сессии слетят). `ROOT_HOST=commrent.kz`, `ENFORCE_SUBDOMAIN=true`, `NODE_ENV=production`. `DATABASE_URL` без изменений.
- **TLS:** Cloudflare Origin Certificate на VPS + SSL Full(strict). Снимает проблему wildcard Let's Encrypt (DNS-01 не нужен).
- **DNS:** в CF `commrent.kz` и `*.commrent.kz` → IP VPS (proxied).

## План переезда (downtime 10–60 мин)

1. VPS Франкфурт, Node 20+, склонировать репо.
2. `.env` (те же секреты), `npm ci`, `npx prisma generate`, `npm run build`.
3. `next start` под systemd (или pm2), автоперезапуск.
4. Caddy/nginx спереди + CF Origin cert.
5. 5 cron-таймеров (без `warm`).
6. Смоук на временном hostname: вход, поддомен `bcf16`, генерация документа, ручной вызов cron.
7. Cutover: переключить A-записи в CF на VPS, Full(strict). Vercel оставить как откат на пару дней.

## Открытые вопросы

- **Сколько окружений нужно** (только prod или + staging)? — НЕ отвечено.
- Характеристики Basic-3 (vCPU/RAM)? Если RAM < 4 ГБ — сборка Next 16 может упереться: swap-файл или сборка в CI + rsync `.next`.

## Следующий шаг (когда вернёмся)

Сгенерировать конкретные файлы: `Caddyfile` (или nginx conf), systemd-юниты для `next start` + 5 cron-таймеров, `deploy.sh` (pull → build → restart), чек-лист cutover. Уточнить: Caddy vs nginx, systemd vs pm2/crontab.
