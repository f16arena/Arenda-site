# Contributing

## Локальная разработка

### Требования

- Node.js 20+.
- Postgres 14+: либо локальный (`docker run --name commrent-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16`), либо отдельный Supabase-проект под dev.

### Установка

```bash
git clone <repo>
cd arenda-pro
npm ci
cd mobile && npm ci && cd ..
```

Скопируйте `.env.example` в `.env` и заполните минимум:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
AUTH_SECRET="$(openssl rand -base64 32)"
NEXTAUTH_URL="http://localhost:3000"
ROOT_HOST="localhost:3000"
SETUP_SECRET="$(openssl rand -base64 32)"
SETUP_ENABLED="true"
CRON_SECRET="$(openssl rand -base64 32)"
```

### Prisma и миграции

```bash
npx prisma generate            # сгенерировать клиент в app/generated/prisma
node scripts/deploy-migrations.mjs   # накатить SQL миграции и кастомные патчи
```

При локальной разработке `npm run build` тоже накатит миграции, но при `npm run dev` — нет, поэтому первый раз нужно вручную.

### Запуск

```bash
npm run dev                # web на http://localhost:3000
cd mobile && npm start     # Expo dev-сервер
```

Для мобильного: установите Expo Go на устройство, отсканируйте QR. Для подключения к локальному API настройте `EXPO_PUBLIC_API_BASE_URL` в `mobile/.env` на ваш LAN-IP (`http://192.168.x.x:3000`), а не localhost.

## Code style

- ESLint 9 (flat config) — `eslint.config.mjs`. Конфиг extends `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`. Папки `tests/e2e/**` и `mobile/**` исключены из основного ESLint runs.
- `npm run lint` должен проходить без warnings перед PR.
- Prettier-конфиг как отдельный файл не задан — стиль приходит из ESLint defaults. Старайтесь следовать существующему форматированию (двойные кавычки, без точек с запятой в редких случаях — но обычно с ними).
- TypeScript strict (`tsconfig.json`).

## Тесты

| Команда | Что делает |
| --- | --- |
| `npm run lint` | ESLint. |
| `npm run test:e2e:web` | Playwright (только web smoke + full-site audit). |
| `npm run test:e2e:web:headed` | То же, но с открытым браузером. |
| `npm run test:e2e:payment` | Critical-path: Charge → Payment (`scripts/e2e-critical-payment.ts`). |
| `npm run test:e2e:isolation` | Multi-tenant изоляция (`scripts/e2e-isolation.ts`). |
| `npm run audit:site` | Полный аудит публичной части. |
| `npm run security:audit` | Поиск Prisma-вызовов без orgScope. |
| `npm run perf:audit` | Тяжёлые client-чанки/импорты. |
| `npm run ci:performance-gate` | CI-gate по перфомансу. |
| `npm run quality:audit` | Lint + perf + payment + isolation одной командой. |
| `npm run test:mobile:typecheck` | `tsc --noEmit` в `mobile/`. |

Vitest и unit-тесты на уровне `lib/` не настроены — все integration-проверки идут через Playwright и tsx-скрипты в `scripts/`.

## Commits и PR

Свежий codebase — без жёсткого convention. Из практики:

```
feat: добавил выгрузку актов сверки в Excel
fix: тенант видел чужие платежи на /admin/finances
chore: обновил next до 16.2.4
docs: правки в DEPLOYMENT
refactor: вынес rent calc в общий helper
```

Не используем emoji в commit-message по умолчанию.

Branch naming:

```
feature/<short-description>
fix/<bug-id-or-area>
chore/<task>
```

Перед PR обязательно:

```bash
npm run build          # должна пройти Prisma + Next build
npm run lint           # 0 warnings
```

Если меняли `prisma/schema.prisma` или `migrations/*.sql`:

```bash
npx prisma validate
npx prisma generate
```

## PR review

- Опишите user-facing изменение в первой строке summary.
- Любая правка в финансовом контуре (rent, charge, payment, контракты) требует апрува владельца проекта и тегирования rollback-точки.
- Изменения в `lib/tenant-scope.ts`, `lib/org.ts`, `proxy.ts`, `auth.ts` — security-sensitive. Желательно добавить тест в `scripts/e2e-isolation.ts`.
- Перед merge в `main` убедитесь, что `npm run build` проходит на CI и что `/api/health/db` после деплоя зелёный.
