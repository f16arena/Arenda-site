# ТЗ — Превращение ArendaPro в SaaS-платформу

> Дата: апрель 2026
> Цель: дать возможность владельцу платформы продавать систему управления арендой другим бизнес-центрам как сервис, с разграничением данных и тарифами.

---

## 0. Концепция

```
PLATFORM_OWNER (вы) ─┬─► Organization "БЦ F16"   (тариф Pro, до 5 зданий)
                     ├─► Organization "Plaza Group" (тариф Starter, до 1 здания)
                     └─► Organization "Office X"    (тариф Free, до 1 здания)
                            │
                            └─► Свой Owner-юзер, свои арендаторы, свои данные.
                                Никогда не видит данные других организаций.
```

- **Один веб-домен**: `arenda-site.vercel.app` (Вариант A — фильтрация по сессии)
- **Изоляция**: каждый запрос на сервере фильтруется по `organizationId` из JWT-сессии
- **Текущие данные F16** → переносятся в первую организацию, для которой создаётся новый владелец

---

## 1. Модель данных

### Новые таблицы

```prisma
// Организация = клиент SaaS
model Organization {
  id              String   @id @default(cuid())
  name            String
  slug            String   @unique
  isActive        Boolean  @default(true)
  isSuspended     Boolean  @default(false)  // супер-админ может приостановить
  ownerUserId     String?                    // главный пользователь (Owner)
  planId          String?
  planExpiresAt   DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

// Тариф (Free/Starter/Pro/Enterprise + кастомные)
model Plan {
  id              String   @id @default(cuid())
  code            String   @unique
  name            String
  description     String?
  priceMonthly    Float    @default(0)
  priceYearly     Float    @default(0)
  maxBuildings    Int?     // null = безлимит
  maxTenants      Int?
  maxUsers        Int?
  maxLeads        Int?
  features        String   // JSON: { emailNotifications, telegramBot, floorEditor, ... }
  isActive        Boolean  @default(true)
  sortOrder       Int      @default(0)
}

// История подписок (продления, смены тарифов)
model Subscription {
  id              String   @id @default(cuid())
  organizationId  String
  planId          String
  startedAt       DateTime @default(now())
  expiresAt       DateTime
  status          String   @default("ACTIVE") // ACTIVE | EXPIRED | CANCELLED
  paidAmount      Float    @default(0)
  paymentMethod   String?  // KASPI | BANK | CASH | OTHER
  notes           String?
}
```

### Изменения существующих таблиц

```prisma
model User {
  // ...существующие поля...
  organizationId  String?  // null только для PLATFORM_OWNER
  isPlatformOwner Boolean  @default(false)  // вы
}

model Building {
  // ...существующие поля...
  organizationId  String   // обязательно
}
```

Остальные таблицы (Tenant, Charge, Payment, etc.) — связаны через цепочку Building→Floor→Space, отдельной колонки не нужно.

Прямой `organizationId` добавляется в:
- `Tariff` (фильтр на странице настроек)
- `Notification` (уже через User)
- `Lead` (уже через Building)
- `AuditLog` — для удобного просмотра всех действий в организации

---

## 2. Безопасность и изоляция данных

### Helper `getCurrentOrganization(session)`

Все запросы должны идти через единый helper, который инжектит `organizationId`.

```typescript
// lib/org.ts
export async function getCurrentOrgId(): Promise<string | null> {
  const session = await auth()
  if (!session?.user) return null
  if (session.user.isPlatformOwner) {
    // Платформа-админ работает в выбранной им организации (cookie)
    return await getCookieOrgId() ?? null
  }
  return session.user.organizationId
}

export async function requireOrgAccess(): Promise<{ orgId: string; userId: string; isPlatformOwner: boolean }> {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const orgId = await getCurrentOrgId()
  if (!orgId) redirect("/superadmin/orgs")
  return { orgId, userId: session.user.id, isPlatformOwner: session.user.isPlatformOwner ?? false }
}
```

### Стандартный паттерн в каждой странице

```typescript
const { orgId } = await requireOrgAccess()
const buildings = await db.building.findMany({
  where: { organizationId: orgId },  // АВТОФИЛЬТР
  ...
})
```

### Тесты изоляции

После реализации — тестовый сценарий:
1. Создать 2 организации
2. В каждой — арендатора с уникальным именем
3. Залогиниться в org A → должен видеть только своего арендатора
4. Сменить логин → видеть только арендатора org B

---

## 3. Тарифы

### Базовые тарифы (создаются автоматически)

| Code | Name | Цена/мес | Зданий | Арендаторов | Сотрудников | Email | Telegram | Редактор | Excel/1С | Банк-импорт | API |
|------|------|---------|--------|------------|-------------|-------|----------|----------|----------|-------------|-----|
| FREE | Бесплатный | 0 | 1 | 10 | 2 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| STARTER | Стартовый | 15 000 ₸ | 1 | 50 | 5 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| PRO | Профи | 35 000 ₸ | 5 | ∞ | ∞ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| ENTERPRISE | Корпоративный | 100 000 ₸ | ∞ | ∞ | ∞ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Платформа-админ может:
- Создавать новые тарифы
- Менять цены
- Менять лимиты
- Менять флаги фич
- Деактивировать тарифы

### Enforcement (жёсткий блок)

Перед каждым `create*` action:
```typescript
async function checkLimit(orgId: string, type: 'building' | 'tenant' | 'user' | 'lead') {
  const plan = await getOrgPlan(orgId)
  if (!plan) throw new Error("Подписка истекла")
  const max = plan[`max${capitalize(type)}s`]
  if (max !== null) {
    const current = await countCurrent(orgId, type)
    if (current >= max) {
      throw new LimitExceededError(`Достигнут лимит ${max} ${type}. Обновите тариф.`)
    }
  }
}
```

Проверка фич:
```typescript
async function requireFeature(orgId: string, feature: string) {
  const plan = await getOrgPlan(orgId)
  const features = JSON.parse(plan.features ?? "{}")
  if (!features[feature]) {
    throw new Error(`Эта функция доступна на тарифе Pro и выше`)
  }
}
```

### Истечение подписки

Cron каждый день проверяет:
- Если `Organization.planExpiresAt < now()` → `isSuspended = true`
- Suspended организация → редирект на `/admin/subscription` с сообщением «Оплатите чтобы продолжить»
- Все Read-only запросы доступны (видят свои данные), но создание/изменение блокировано

---

## 4. Супер-админ панель `/superadmin`

Доступ только для пользователей с `isPlatformOwner = true`.

### Страницы

#### `/superadmin` — Главная
- Метрики:
  - Всего организаций / активных / приостановленных
  - Общая выручка платформы (сумма subscription.paidAmount)
  - Распределение по тарифам (диаграмма)
  - Топ-5 организаций по активности (количество арендаторов)
- Последние действия (от любых организаций)

#### `/superadmin/orgs` — Список организаций
- Таблица: название, slug, тариф, статус, expiresAt, количество арендаторов
- Фильтры: статус, тариф, поиск по названию
- Кнопка «+ Создать организацию»

#### `/superadmin/orgs/new` — Создание
- Форма:
  - Название организации
  - Slug (авто-генерируется из названия)
  - Тариф (выбор)
  - Срок подписки (по умолчанию 1 месяц)
  - **Создание Owner-пользователя:**
    - ФИО
    - Email или телефон
    - Временный пароль (генерируется или задаётся)
- При создании:
  1. Создаётся Organization
  2. Создаётся User с `organizationId` и role `OWNER`
  3. Owner назначается `Organization.ownerUserId`
  4. Создаётся Subscription
  5. (опционально) Email/SMS Owner-у с инструкцией

#### `/superadmin/orgs/[id]` — Детали организации
- Информация: название, тариф, srok
- Кнопки: Продлить подписку, Сменить тариф, Приостановить, **Войти как этот клиент** (impersonate)
- Owner-пользователь
- Список зданий (количество)
- Аудит действий по этой организации

#### `/superadmin/plans` — Управление тарифами
- Таблица всех тарифов (включая кастомные)
- CRUD: создать новый, редактировать, деактивировать
- Drag-to-reorder для отображения

#### `/superadmin/metrics` — Аналитика платформы
- Графики: новые организации по месяцам, churn rate
- Когортный анализ
- Финансовые метрики MRR, ARR

### Impersonate

```typescript
// Server action
export async function impersonate(orgId: string) {
  const session = await auth()
  if (!session?.user.isPlatformOwner) throw new Error("Forbidden")

  const ownerUser = await db.user.findFirst({ where: { organizationId: orgId, role: "OWNER" } })
  if (!ownerUser) throw new Error("Owner не найден")

  // Создаём временную сессию: actAs = ownerUser
  await setCookie("impersonating", JSON.stringify({
    actAsUserId: ownerUser.id,
    realUserId: session.user.id,
    startedAt: Date.now(),
  }))

  await audit({ action: "IMPERSONATE_START", entity: "organization", entityId: orgId })
  redirect("/admin")
}

export async function stopImpersonate() {
  const cookie = await getImpersonateCookie()
  if (cookie) {
    await audit({ action: "IMPERSONATE_END", entity: "user", entityId: cookie.actAsUserId })
  }
  await deleteCookie("impersonating")
  redirect("/superadmin")
}
```

В шапке клиента, когда вы зашли как он:
> ⚠️ Вы вошли как поддержка (БЦ F16). [Выйти из режима →]

Все действия в режиме impersonate записываются в audit log с пометкой `via_impersonate: true`.

---

## 5. Кабинет клиента — изменения

### Новая страница `/admin/subscription`

- Текущий тариф
- Срок до конца подписки + дни
- Использование лимитов с прогресс-барами:
  - 3 из 5 зданий
  - 27 из 50 арендаторов
- Кнопка «Обновить тариф» (отправляет письмо вам)
- История подписок (subscription history)

### Баннеры в шапке

- Если `expiresAt < 7 дней` → жёлтый баннер «Подписка истекает через X дней»
- Если `isSuspended` → красный баннер «Подписка приостановлена. Свяжитесь с поддержкой»

### Блок при попытке превысить лимит

Toast `Достигнут лимит 50 арендаторов. [Обновить тариф →]` ведёт на `/admin/subscription`.

---

## 6. Миграция текущих данных

### Backfill (один раз при деплое)

```sql
-- 1. Создать тарифы
INSERT INTO plans (code, name, price_monthly, max_buildings, max_tenants, max_users, features) VALUES
  ('FREE', 'Бесплатный', 0, 1, 10, 2, '{"emailNotifications":false,...}'),
  ('STARTER', 'Стартовый', 15000, 1, 50, 5, '{"emailNotifications":true,...}'),
  ('PRO', 'Профи', 35000, 5, NULL, NULL, '{"emailNotifications":true,...}'),
  ('ENTERPRISE', 'Корпоративный', 100000, NULL, NULL, NULL, '{...,"api":true}');

-- 2. Создать организацию для текущих данных
INSERT INTO organizations (id, name, slug, plan_id, plan_expires_at, owner_user_id)
VALUES ('org_f16', 'БЦ F16', 'f16',
  (SELECT id FROM plans WHERE code = 'PRO'),
  NOW() + INTERVAL '1 year',
  NULL);

-- 3. Привязать существующие здания к организации
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS organization_id TEXT;
UPDATE buildings SET organization_id = 'org_f16' WHERE organization_id IS NULL;
ALTER TABLE buildings ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE buildings ADD CONSTRAINT fk_buildings_org FOREIGN KEY (organization_id) REFERENCES organizations(id);

-- 4. User: добавить organizationId и isPlatformOwner
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_owner BOOLEAN NOT NULL DEFAULT FALSE;

-- 5. Сделать f16arena@gmail.com платформа-админом
UPDATE users SET is_platform_owner = TRUE, organization_id = NULL
WHERE email = 'f16arena@gmail.com';

-- 6. Остальные существующие users → org_f16 как обычные клиенты
UPDATE users SET organization_id = 'org_f16'
WHERE organization_id IS NULL AND is_platform_owner = FALSE;

-- 7. (вручную через UI после деплоя) Создать нового владельца БЦ F16
-- через /superadmin/orgs/[id] → "Сменить владельца"
```

### Что произойдёт после миграции

- Существующий `f16arena@gmail.com` становится **PLATFORM_OWNER** → видит `/superadmin`
- Все остальные данные остаются на месте, просто привязываются к организации `org_f16`
- Вы создаёте **нового пользователя** через супер-админку → назначаете владельцем БЦ F16
- БЦ F16 продолжает работать как раньше для нового владельца

---

## 7. План реализации по спринтам

### Спринт 1 — Multi-tenant фундамент (1-2 дня)
**Deliverables:**
- ✅ Модели Organization, Plan, Subscription
- ✅ Миграция 010 + backfill
- ✅ User.organizationId + User.isPlatformOwner
- ✅ Building.organizationId
- ✅ NextAuth: organizationId + isPlatformOwner в JWT/session
- ✅ Helper `getCurrentOrgId()` + `requireOrgAccess()`
- ✅ Главные страницы фильтруются по orgId (dashboard, buildings, tenants, finances)

### Спринт 2 — Супер-админ панель (1 день)
**Deliverables:**
- ✅ Раздел `/superadmin` с проверкой `isPlatformOwner`
- ✅ Список организаций
- ✅ Создание организации + первого Owner-пользователя
- ✅ Детали организации
- ✅ Impersonate (вход как клиент)
- ✅ Жёлтая полоса в шапке во время импер-режима

### Спринт 3 — Тарифы и лимиты (1 день)
**Deliverables:**
- ✅ CRUD тарифов в `/superadmin/plans`
- ✅ Helper `checkLimit(orgId, type)` + интеграция в actions
- ✅ Helper `requireFeature(orgId, feature)`
- ✅ Toast "Достигнут лимит" с кнопкой апгрейда
- ✅ Страница `/admin/subscription` для клиента
- ✅ Баннеры истечения подписки
- ✅ Cron daily проверка `planExpiresAt`

### Спринт 4 — Метрики платформы (0.5 дня)
**Deliverables:**
- ✅ `/superadmin` главная с KPI: orgs, MRR, distribution
- ✅ Графики динамики

### Спринт 5 — Тесты изоляции и polish (0.5 дня)
**Deliverables:**
- ✅ Манульные тесты: создал 2 org, проверил изоляцию каждого экрана
- ✅ Документация для клиентов
- ✅ Баг-фиксы

---

## 8. Что в этом ТЗ НЕТ (на будущее)

- Авто-биллинг (Kaspi Pay) — отдельный спринт
- ИИ-функционал (чат-бот, OCR, скоринг) — отдельный модуль
- Self-service регистрация — после ручного периода
- Subdomain `xxx.arenda.kz` — переход с варианта A на C
- Multi-org access (один user → несколько org) — позже
- White-label (свой логотип/цвета у Enterprise) — отдельный спринт
- API для клиентов с rate-limiting — для тарифа Enterprise

---

## 9. Критерии готовности

Запуск возможен когда:
- ✅ Создание новой организации работает за < 30 секунд
- ✅ Изоляция данных проверена на 5 случайных страницах
- ✅ Лимиты блокируют превышения
- ✅ Impersonate работает безопасно с audit
- ✅ Существующая `БЦ F16` data сохранилась 1:1
- ✅ Платформа-админ может работать без помощи разработчика

---

## 10. Технический стек

Без изменений: Next.js 16, Prisma 7, Supabase PostgreSQL, NextAuth v5, TailwindCSS 4, Vercel.

Дополнительно:
- Прохождение JWT через сессию: `session.user.organizationId`, `session.user.isPlatformOwner`
- Cookie `currentOrgId` (для платформа-админа когда он работает в чьей-то org)
- Cookie `impersonating` (для режима поддержки)

---

**Старт работ: сразу после прочтения этого ТЗ.**
