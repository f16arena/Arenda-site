# Commrent / Arenda Pro

SaaS-платформа для управления коммерческой арендой: организации, здания, помещения, арендаторы, начисления, платежи, документы, заявки, счетчики, FAQ, роли и tenant portal.

## Быстрый старт

1. Установить зависимости:

```bash
npm ci
```

2. Создать `.env` на основе `.env.example` и заполнить минимум:

```bash
DATABASE_URL=postgresql://...
AUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
ROOT_HOST=localhost:3000
CRON_SECRET=...
```

3. Сгенерировать Prisma Client и запустить проект:

```bash
npx prisma generate
npm run dev
```

Локальный сайт: [http://localhost:3000](http://localhost:3000)

## Основные команды

```bash
npm run dev          # локальная разработка
npm run build        # Prisma generate + production build
npm run lint         # ESLint, должен проходить без warnings
npm run start        # запуск production-сборки
npm run perf:audit   # поиск тяжелых client chunks/imports
```

## Проверки перед push

Перед каждым релизом запускаем:

```bash
npm run build
npm run lint
```

Если менялись Prisma schema или SQL-миграции, дополнительно:

```bash
npx prisma validate
npx prisma generate
```

## Релизы и rollback

Версия хранится в `package.json`, `package-lock.json`, `VERSION` и `CHANGELOG.md`.

Рабочий порядок:

```bash
git tag rollback/pre-short-change-1.x.y
npm version 1.x.y --no-git-tag-version
npm run build
npm run lint
git add .
git commit -m "type: short description"
git tag v1.x.y
git push origin main
git push origin v1.x.y rollback/pre-short-change-1.x.y
```

Откат на GitHub/Vercel делаем к rollback-тегу или предыдущему release-тегу. В коде не используем `git reset --hard` без явной команды владельца проекта.

## Архитектура доступа

- `PLATFORM_OWNER`: SaaS-владелец платформы, superadmin.
- `OWNER`: владелец организации/зданий, видит общую картину по всем доступным зданиям.
- `ADMIN`, `ACCOUNTANT`, `FACILITY_MANAGER`, `STAFF`: операционные роли, доступ ограничивается секциями и назначенными зданиями.
- `TENANT`: арендатор, работает только в tenant portal.

Multi-tenant защита идет через:

- `requireOrgAccess()` для организации;
- `requireSection(section, action)` для прав по разделам;
- `assert*InOrg()` и `assertBuildingAccess()` для server-side scope;
- `user_building_access` для ограничения одного администратора несколькими зданиями.

## Важные правила продукта

- Аренда у арендатора считается через общий helper `lib/rent.ts`.
- Индивидуальная аренда бывает только одним способом: ставка за м² или фиксированная сумма в месяц.
- Изменение условий аренды, если условия закреплены договором, должно идти через доп. соглашение.
- Арендатор не видит личный телефон/email владельца; коммуникация идет через администратора.
- Критичные действия должны иметь защиту: подтверждение, scoped server action и rollback-точку в релизе.

## Диагностика

Основные экраны поддержки:

- `/admin/system-health` — env, БД, email, cron, RLS/grants, sitemap/robots, error log.
- `/admin/data-quality` — проблемы данных: контакты, аренда, помещения, договоры, счета.
- `/admin/audit` — журнал действий.
- `/admin/email-logs` — история отправки писем.
- `/admin/faq` — база знаний для владельца, администратора и арендатора.

Если пользователь видит production digest/error, сначала проверяем `/admin/system-health` и server logs, затем ищем запись в `audit_logs`.

## База данных и Supabase

Приложение работает через Prisma/PostgreSQL. Public Supabase Data API не должен напрямую читать tenant-данные:

- RLS включен на public tables;
- для application tables есть deny-by-default policies;
- grants для `anon` и `authenticated` должны быть отозваны;
- проверки RLS/grants есть в `/admin/system-health`.

SQL-миграции лежат в `migrations/`, Prisma schema — в `prisma/schema.prisma`.

## Документы и подписи

Документы генерируются через DOCX helpers/templates. Подписание должно проходить через общий workflow, чтобы доп. соглашения и основные договоры одинаково меняли статус и применяли изменения только после `SIGNED`.

## Производительность

Тяжелые client-компоненты выносим в отдельные chunks через dynamic import. После изменений в визуальных редакторах, документах или уведомлениях запускаем:

```bash
npm run perf:audit
```

## Где продолжать улучшения

Приоритеты:

1. Финансовый контур: начисление -> счет -> платеж -> акт -> сверка.
2. Юридический контур: договор -> доп. соглашение -> подпись -> применение изменений.
3. Операционный контур: заявки, задачи, счетчики, уведомления.
4. Data Quality Center и human-readable ошибки.
5. Поддержка SaaS: health, audit, impersonation, subscription limits, release discipline.
