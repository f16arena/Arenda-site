import "server-only"

import { readFile, readdir, stat } from "fs/promises"
import path from "path"
import { db } from "@/lib/db"

export type SystemCheckStatus = "ok" | "warning" | "error"

export type SystemCheck = {
  id: string
  label: string
  status: SystemCheckStatus
  message: string
  details?: string[]
  ms?: number
}

export type SystemHealthSummary = {
  status: SystemCheckStatus
  ok: boolean
  total: number
  okCount: number
  warningCount: number
  errorCount: number
}

type MigrationRow = {
  migration_name: string
  finished_at: Date | null
  rolled_back_at: Date | null
}

const REQUIRED_ENV = [
  "DATABASE_URL",
  "DIRECT_URL",
  "NEXTAUTH_URL",
  "ROOT_HOST",
  "CRON_SECRET",
] as const

const REQUIRED_TABLES = [
  "api_keys",
  "organizations",
  "plans",
  "subscriptions",
  "users",
  "buildings",
  "user_building_access",
  "floors",
  "spaces",
  "tenant_spaces",
  "tenant_bank_accounts",
  "tenants",
  "cash_accounts",
  "cash_transactions",
  "charges",
  "payments",
  "payment_reports",
  "contracts",
  "document_signatures",
  "document_templates",
  "generated_documents",
  "tenant_documents",
  "stored_files",
  "faq_articles",
  "address_cache",
  "web_vital_metrics",
  "meters",
  "meter_readings",
  "requests",
  "request_comments",
  "tasks",
  "messages",
  "notifications",
  "audit_logs",
  "email_logs",
  "role_permissions",
] as const

const REQUIRED_COLUMNS = [
  {
    table: "organizations",
    columns: [
      "legal_type",
      "legal_name",
      "director_name",
      "basis",
      "bank_name",
      "second_bank_name",
      "second_iik",
      "second_bik",
    ],
  },
  {
    table: "buildings",
    columns: [
      "administrator_user_id",
      "contract_prefix",
      "invoice_prefix",
      "address_country_code",
      "address_city",
      "address_street",
      "address_source_id",
    ],
  },
  {
    table: "floors",
    columns: ["fixed_monthly_rent", "full_floor_tenant_id"],
  },
  {
    table: "tenants",
    columns: ["space_id", "custom_rate", "fixed_monthly_rent", "legal_type", "iin"],
  },
  {
    table: "tenant_spaces",
    columns: ["tenant_id", "space_id", "is_primary"],
  },
  {
    table: "tenant_bank_accounts",
    columns: ["tenant_id", "bank_name", "iik", "bik", "is_primary"],
  },
  {
    table: "payment_reports",
    columns: ["method", "receipt_file_id", "reviewed_by_id", "payment_id"],
  },
  {
    table: "stored_files",
    columns: [
      "organization_id",
      "building_id",
      "tenant_id",
      "category",
      "visibility",
      "compressed_size",
      "data",
    ],
  },
  {
    table: "address_cache",
    columns: ["query_key", "display_name", "source_id", "country_code"],
  },
  {
    table: "web_vital_metrics",
    columns: ["organization_id", "name", "value", "path", "created_at"],
  },
] as const

const RECENT_REQUIRED_MIGRATIONS = [
  "20260504110000_payment_reports",
  "20260504123000_faq_articles",
  "20260504190000_db_storage_files",
  "20260504203000_payment_report_method",
  "20260504213000_tenant_spaces",
  "20260504220000_organization_requisites",
  "20260504230000_organization_second_bank_account",
  "20260504233000_storage_saas_scope",
  "20260505000000_kz_address_autocomplete",
  "20260505003000_performance_indexes",
  "20260505004000_web_vital_metrics",
  "20260505010000_tenant_bank_accounts",
] as const

const EXPECTED_CRONS = [
  "/api/cron/check-deadlines",
  "/api/cron/monthly-invoices",
  "/api/cron/check-subscriptions",
] as const

const CLIENT_FILE_BUDGET = 140 * 1024
const SERVER_FILE_BUDGET = 80 * 1024
const PERFORMANCE_WATCH_FILES = [
  { rel: path.join("app", "admin", "floors", "[id]", "floor-editor.tsx"), isClient: true },
  { rel: path.join("app", "admin", "tenants", "[id]", "page.tsx"), isClient: false },
  { rel: path.join("app", "admin", "data-quality", "page.tsx"), isClient: false },
  { rel: path.join("app", "admin", "spaces", "page.tsx"), isClient: false },
  { rel: path.join("app", "admin", "page.tsx"), isClient: false },
  { rel: path.join("app", "cabinet", "page.tsx"), isClient: false },
  { rel: path.join("lib", "system-health.ts"), isClient: false },
] as const

export async function runSystemHealthChecks(): Promise<SystemCheck[]> {
  const checks = await Promise.all([
    withTiming("env", "Переменные окружения", checkEnvironment),
    withTiming("release", "Версия и release-файлы", checkReleaseVersion),
    withTiming("database", "База данных", checkDatabase),
    withTiming("schema", "Prisma-схема и таблицы", checkSchemaTables),
    withTiming("rls", "Supabase RLS", checkSensitiveRls),
    withTiming("security", "Критичные guardrails", checkSecurityGuardrails),
    withTiming("performance", "Performance budget", checkPerformanceBudget),
    withTiming("migrations", "Миграции", checkMigrations),
    withTiming("cron", "Cron-задачи", checkCron),
    withTiming("email", "Email-канал", checkEmail),
    withTiming("storage", "Хранилище документов", checkStorage),
    withTiming("domain", "Домен, robots и sitemap", checkDomainAndSeo),
    withTiming("observability", "Логи и ошибки", checkObservability),
  ])

  return checks
}

export function summarizeSystemChecks(checks: SystemCheck[]): SystemHealthSummary {
  const errorCount = checks.filter((check) => check.status === "error").length
  const warningCount = checks.filter((check) => check.status === "warning").length
  const okCount = checks.filter((check) => check.status === "ok").length
  const status: SystemCheckStatus = errorCount > 0 ? "error" : warningCount > 0 ? "warning" : "ok"

  return {
    status,
    ok: status !== "error",
    total: checks.length,
    okCount,
    warningCount,
    errorCount,
  }
}

async function withTiming(
  id: string,
  label: string,
  fn: () => Promise<Omit<SystemCheck, "id" | "label" | "ms">>
): Promise<SystemCheck> {
  const started = Date.now()
  try {
    const result = await fn()
    return { id, label, ...result, ms: Date.now() - started }
  } catch (error) {
    return {
      id,
      label,
      status: "error",
      message: "Проверка завершилась ошибкой.",
      details: [error instanceof Error ? error.message : String(error)],
      ms: Date.now() - started,
    }
  }
}

async function checkEnvironment(): Promise<Omit<SystemCheck, "id" | "label" | "ms">> {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key])
  const authConfigured = !!(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET)
  const details: string[] = []

  if (!authConfigured) details.push("AUTH_SECRET или NEXTAUTH_SECRET не задан.")
  if (missing.length > 0) details.push(`Не заданы: ${missing.join(", ")}.`)

  const recommendations = [
    !process.env.RESEND_API_KEY ? "RESEND_API_KEY не задан: письма будут только логироваться." : null,
    !process.env.EMAIL_FROM ? "EMAIL_FROM не задан: будет использован fallback отправителя." : null,
    !(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)
      ? "SENTRY_DSN не задан: внешняя отправка ошибок не подключена, работает внутренний журнал."
      : null,
  ].filter(Boolean) as string[]

  if (details.length > 0) {
    return {
      status: "error",
      message: "Не хватает обязательных переменных для production.",
      details: [...details, ...recommendations],
    }
  }

  if (recommendations.length > 0) {
    return {
      status: "warning",
      message: "Обязательные переменные заданы, но есть production-рекомендации.",
      details: recommendations,
    }
  }

  return {
    status: "ok",
    message: "Обязательные переменные и внешние каналы настроены.",
  }
}

async function checkReleaseVersion(): Promise<Omit<SystemCheck, "id" | "label" | "ms">> {
  const version = await readFile(path.join(/* turbopackIgnore: true */ process.cwd(), "VERSION"), "utf8")
    .then((value) => value.trim())
    .catch(() => null)
  const packageJson = await readJson<{ version?: string }>("package.json")
  const packageLock = await readJson<{ version?: string; packages?: Record<string, { version?: string }> }>("package-lock.json")
  const changelog = await readFile(path.join(/* turbopackIgnore: true */ process.cwd(), "CHANGELOG.md"), "utf8").catch(() => "")

  const details: string[] = []
  if (!version) details.push("VERSION не найден или пустой.")
  if (version && packageJson?.version !== version) details.push(`package.json=${packageJson?.version ?? "missing"}, VERSION=${version}.`)
  if (version && packageLock?.version !== version) details.push(`package-lock root=${packageLock?.version ?? "missing"}, VERSION=${version}.`)
  if (version && packageLock?.packages?.[""]?.version !== version) {
    details.push(`package-lock package=${packageLock?.packages?.[""]?.version ?? "missing"}, VERSION=${version}.`)
  }
  if (version && !changelog.includes(`## ${version} -`)) details.push(`CHANGELOG.md не содержит запись для ${version}.`)

  if (details.length > 0) {
    return {
      status: "error",
      message: "Release-файлы расходятся. Перед deploy нужно выровнять версию.",
      details,
    }
  }

  return {
    status: "ok",
    message: `Release-файлы синхронизированы: ${version}.`,
    details: ["VERSION, package.json, package-lock.json и CHANGELOG.md совпадают."],
  }
}

async function checkSecurityGuardrails(): Promise<Omit<SystemCheck, "id" | "label" | "ms">> {
  const errors: string[] = []
  const details: string[] = []
  const sourceAvailable = await sourceFileAvailable("lib", "cron-auth.ts")

  if (!sourceAvailable && isProductionRuntime()) {
    if (!process.env.CRON_SECRET) {
      return {
        status: "error",
        message: "Cron-секрет не настроен.",
        details: ["CRON_SECRET обязателен: cron endpoints должны требовать Authorization: Bearer <CRON_SECRET>."],
      }
    }

    return {
      status: "ok",
      message: "Runtime guardrails проверены. Source-scan пропущен в production bundle.",
      details: [
        "CRON_SECRET задан, cron endpoints работают через Bearer-секрет.",
        "Статический scan route.ts/lib/*.ts выполняется локально и в CI, потому что Vercel runtime не всегда содержит исходники app/ как файлы.",
      ],
    }
  }

  const cronAuth = await readFile(path.join(/* turbopackIgnore: true */ process.cwd(), "lib", "cron-auth.ts"), "utf8").catch(() => "")
  if (!cronAuth.includes("CRON_SECRET")) errors.push("lib/cron-auth.ts не проверяет CRON_SECRET.")
  if (!cronAuth.includes("authorization") || !cronAuth.includes("Bearer ")) {
    errors.push("lib/cron-auth.ts должен требовать Authorization: Bearer <CRON_SECRET>.")
  }

  for (const cronPath of EXPECTED_CRONS) {
    const routePath = path.join(/* turbopackIgnore: true */ process.cwd(), "app", ...cronPath.replace(/^\/api\//, "api/").split("/"), "route.ts")
    const route = await readFile(routePath, "utf8").catch(() => "")
    if (!route.includes("authorizeCronRequest")) errors.push(`${cronPath} не использует authorizeCronRequest.`)
  }

  const passwordReset = await readFile(path.join(/* turbopackIgnore: true */ process.cwd(), "app", "actions", "password-reset.ts"), "utf8").catch(() => "")
  if (passwordReset.includes("previewLink") && !passwordReset.includes('process.env.NODE_ENV === "production"')) {
    errors.push("password-reset возвращает previewLink без production-защиты.")
  }

  const org = await readFile(path.join(/* turbopackIgnore: true */ process.cwd(), "lib", "org.ts"), "utf8").catch(() => "")
  if (!org.includes("signImpersonatePayload")) errors.push("Impersonation cookie не подписывается HMAC.")
  if (!org.includes("getValidatedImpersonateForUser")) errors.push("Impersonation cookie не проходит server-side validation.")
  if (!org.includes("realUserId") || !org.includes("user.id")) errors.push("Impersonation не сверяет realUserId с текущей сессией.")
  if (!org.includes("httpOnly: true") || !org.includes("secure: process.env.NODE_ENV === \"production\"")) {
    errors.push("Impersonation/superadmin cookie должны быть httpOnly и secure в production.")
  }

  if (process.env.ENFORCE_SUBDOMAIN !== "true") {
    details.push("ENFORCE_SUBDOMAIN не включен: после полного DNS wildcard лучше включить строгую проверку slug ↔ org.")
  }

  if (errors.length > 0) {
    return {
      status: "error",
      message: "Критичные security guardrails отсутствуют или ослаблены.",
      details: [...errors, ...details],
    }
  }

  return {
    status: details.length > 0 ? "warning" : "ok",
    message: details.length > 0
      ? "Критичные guardrails на месте, но есть production-рекомендации."
      : "Cron, password reset и impersonation защищены базовыми guardrails.",
    details: [
      "Cron endpoints требуют Bearer-секрет.",
      "Password reset не отдает previewLink в production.",
      "Impersonation cookie подписан, httpOnly и проверяется по realUserId.",
      ...details,
    ],
  }
}

async function checkPerformanceBudget(): Promise<Omit<SystemCheck, "id" | "label" | "ms">> {
  const enriched = await Promise.all(PERFORMANCE_WATCH_FILES.map(async (file) => {
    const content = await readFile(path.join(/* turbopackIgnore: true */ process.cwd(), file.rel), "utf8").catch(() => "")
    const size = Buffer.byteLength(content)
    return { rel: file.rel, size, isClient: file.isClient, exists: content.length > 0 }
  }))

  const violations = enriched.flatMap((file) => {
    if (!file.exists) return [`${file.rel} не найден.`]
    if (file.isClient && file.size > CLIENT_FILE_BUDGET) {
      return [`${formatSourceFile(file)} превышает client budget ${formatBytes(CLIENT_FILE_BUDGET)}.`]
    }
    if (!file.isClient && file.size > SERVER_FILE_BUDGET) {
      return [`${formatSourceFile(file)} превышает server budget ${formatBytes(SERVER_FILE_BUDGET)}.`]
    }
    return []
  })
  const largest = enriched
    .sort((a, b) => b.size - a.size)
    .slice(0, 6)
    .map((file) => formatSourceFile(file))

  if (violations.length > 0) {
    return {
      status: "error",
      message: "Performance budget превышен.",
      details: [...violations, ...largest.map((line) => `Крупный файл: ${line}.`)],
    }
  }

  return {
    status: "ok",
    message: "Performance budget соблюден.",
    details: [
      `Client budget: ${formatBytes(CLIENT_FILE_BUDGET)}.`,
      `Server budget: ${formatBytes(SERVER_FILE_BUDGET)}.`,
      "Полный scan запускается командой npm run perf:audit.",
      ...largest.map((line) => `Крупный файл: ${line}.`),
    ],
  }
}

async function checkDatabase(): Promise<Omit<SystemCheck, "id" | "label" | "ms">> {
  if (!process.env.DATABASE_URL) {
    return {
      status: "error",
      message: "DATABASE_URL не задан.",
    }
  }

  const [ping, stats] = await Promise.all([
    db.$queryRaw<Array<{ ok: number }>>`SELECT 1::int AS ok`,
    db.$queryRaw<Array<{ organizations: number; users: number; buildings: number }>>`
      SELECT
        (SELECT COUNT(*)::int FROM organizations) AS organizations,
        (SELECT COUNT(*)::int FROM users) AS users,
        (SELECT COUNT(*)::int FROM buildings) AS buildings
    `,
  ])

  if (ping[0]?.ok !== 1) {
    return {
      status: "error",
      message: "База ответила неожиданным результатом.",
    }
  }

  const row = stats[0]
  return {
    status: "ok",
    message: "Подключение к базе работает.",
    details: row
      ? [
          `Организаций: ${row.organizations}.`,
          `Пользователей: ${row.users}.`,
          `Зданий: ${row.buildings}.`,
        ]
      : undefined,
  }
}

async function checkSchemaTables(): Promise<Omit<SystemCheck, "id" | "label" | "ms">> {
  const [tableRows, columnRows] = await Promise.all([
    db.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `,
    db.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, column_name
    `,
  ])

  const tables = tableRows.map((row) => row.table_name)
  const missing = REQUIRED_TABLES.filter((table) => !tables.includes(table))
  const columnsByTable = new Map<string, Set<string>>()
  for (const row of columnRows) {
    const columns = columnsByTable.get(row.table_name) ?? new Set<string>()
    columns.add(row.column_name)
    columnsByTable.set(row.table_name, columns)
  }
  const missingColumns = REQUIRED_COLUMNS.flatMap(({ table, columns }) => {
    const tableColumns = columnsByTable.get(table)
    if (!tableColumns) return columns.map((column) => `${table}.${column}`)
    return columns.filter((column) => !tableColumns.has(column)).map((column) => `${table}.${column}`)
  })
  const checkedColumns = REQUIRED_COLUMNS.reduce((sum, item) => sum + item.columns.length, 0)

  if (missing.length > 0 || missingColumns.length > 0) {
    return {
      status: "error",
      message: "Production-БД отстала от кода приложения.",
      details: [
        missing.length > 0 ? `Отсутствуют таблицы: ${missing.join(", ")}.` : null,
        missingColumns.length > 0 ? `Отсутствуют колонки: ${missingColumns.join(", ")}.` : null,
        "Запустите `prisma migrate deploy` или дождитесь Vercel build, который применяет миграции перед `next build`.",
        `Найдено таблиц: ${tables.length}.`,
        `Проверено колонок: ${checkedColumns}.`,
      ].filter(Boolean) as string[],
    }
  }

  const missingRecentMigrations = await getMissingRecentMigrations()
  if (missingRecentMigrations.length > 0) {
    return {
      status: "warning",
      message: "Объекты схемы найдены, но в истории Prisma нет части свежих миграций.",
      details: [
        `Нет записей миграций: ${missingRecentMigrations.join(", ")}.`,
        "Если БД меняли вручную, лучше выполнить `prisma migrate deploy` или выровнять историю миграций.",
      ],
    }
  }

  return {
    status: "ok",
    message: "Ключевые таблицы актуальной Prisma-схемы найдены.",
    details: [
      `Проверено таблиц: ${REQUIRED_TABLES.length}.`,
      `Проверено колонок: ${checkedColumns}.`,
    ],
  }
}

async function checkSensitiveRls(): Promise<Omit<SystemCheck, "id" | "label" | "ms">> {
  const rows = await db.$queryRaw<Array<{
    table_name: string
    rls_enabled: boolean
    client_grants: number
    policy_count: number
  }>>`
    SELECT
      c.relname AS table_name,
      c.relrowsecurity AS rls_enabled,
      COUNT(DISTINCT p.oid)::int AS policy_count,
      COUNT(g.privilege_type)::int AS client_grants
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_policy p ON p.polrelid = c.oid
    LEFT JOIN information_schema.role_table_grants g
      ON g.table_schema = n.nspname
      AND g.table_name = c.relname
      AND g.grantee IN ('anon', 'authenticated')
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
    GROUP BY c.relname, c.relrowsecurity
    ORDER BY c.relname
  `

  const rlsDisabled = rows.filter((row) => !row.rls_enabled)
  const noPolicies = rows.filter((row) => row.rls_enabled && row.policy_count === 0)
  const exposedGrants = rows.filter((row) => row.client_grants > 0)

  if (rlsDisabled.length > 0 || noPolicies.length > 0 || exposedGrants.length > 0) {
    return {
      status: "error",
      message: "Public RLS tables are not fully protected from Supabase Data API.",
      details: [
        rlsDisabled.length > 0 ? `RLS disabled: ${limitTableList(rlsDisabled.map((row) => row.table_name))}.` : null,
        noPolicies.length > 0 ? `RLS enabled without policies: ${limitTableList(noPolicies.map((row) => row.table_name))}.` : null,
        exposedGrants.length > 0 ? `Client grants for anon/authenticated: ${limitTableList(exposedGrants.map((row) => row.table_name))}.` : null,
      ].filter(Boolean) as string[],
    }
  }

  return {
    status: "ok",
    message: "Public RLS tables have explicit policies and no client grants.",
    details: [
      `Checked public tables: ${rows.length}.`,
      "Client access remains routed through Next.js server actions and Prisma.",
    ],
  }
}

async function getMissingRecentMigrations(): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>>`
    SELECT migration_name, finished_at, rolled_back_at
    FROM "_prisma_migrations"
  `.catch(() => null)

  if (!rows) return []

  const applied = new Set(
    rows
      .filter((migration) => migration.finished_at && !migration.rolled_back_at)
      .map((migration) => migration.migration_name)
  )

  return RECENT_REQUIRED_MIGRATIONS.filter((migration) => !applied.has(migration))
}

async function checkMigrations(): Promise<Omit<SystemCheck, "id" | "label" | "ms">> {
  const localMigrations = await getLocalMigrations()
  if (localMigrations.length === 0) {
    const dbMigrations = await getDbMigrations()
    if (dbMigrations && dbMigrations.length > 0) {
      const applied = dbMigrations.filter((migration) => migration.finished_at && !migration.rolled_back_at)
      const latestApplied = applied.at(-1)?.migration_name
      const missingRecent = RECENT_REQUIRED_MIGRATIONS.filter((migration) => !applied.some((row) => row.migration_name === migration))

      return {
        status: missingRecent.length > 0 ? "warning" : "ok",
        message: missingRecent.length > 0
          ? "В production недоступны локальные migration-файлы, но история БД найдена частично."
          : "История Prisma-миграций в БД найдена.",
        details: [
          "Vercel runtime может не содержать папку prisma/migrations как обычные файлы, поэтому проверяем _prisma_migrations в БД.",
          latestApplied ? `Последняя примененная: ${latestApplied}.` : "Примененные миграции не найдены.",
          `Записей в истории БД: ${dbMigrations.length}.`,
          missingRecent.length > 0 ? `Нет свежих миграций: ${missingRecent.join(", ")}.` : null,
        ].filter(Boolean) as string[],
      }
    }

    return {
      status: "warning",
      message: "Локальные Prisma-миграции не найдены.",
      details: [
        "Если это production, проверьте наличие таблицы _prisma_migrations и переменной DIRECT_URL.",
      ],
    }
  }

  const dbMigrations = await getDbMigrations()

  if (!dbMigrations) {
    return {
      status: "warning",
      message: "Prisma migration history table не найдена.",
      details: [
        "База выглядит как созданная вручную или через db push.",
        "Ключевые таблицы проверяются отдельно, но для надежных deploy/rollback лучше сделать rebaseline Prisma migrations.",
      ],
    }
  }

  const applied = new Set(
    dbMigrations
      .filter((migration) => migration.finished_at && !migration.rolled_back_at)
      .map((migration) => migration.migration_name)
  )
  const pending = localMigrations.filter((migration) => !applied.has(migration))
  const rolledBack = dbMigrations.filter((migration) => migration.rolled_back_at).map((migration) => migration.migration_name)
  const latestLocal = localMigrations.at(-1)
  const latestApplied = dbMigrations.filter((migration) => migration.finished_at && !migration.rolled_back_at).at(-1)?.migration_name

  if (pending.length > 0 || rolledBack.length > 0) {
    return {
      status: "error",
      message: "Есть непримененные или откатанные миграции.",
      details: [
        pending.length > 0 ? `Не применены: ${pending.join(", ")}.` : null,
        rolledBack.length > 0 ? `Откатаны: ${rolledBack.join(", ")}.` : null,
        latestApplied ? `Последняя примененная: ${latestApplied}.` : "Примененные миграции не найдены.",
      ].filter(Boolean) as string[],
    }
  }

  return {
    status: "ok",
    message: "Все локальные Prisma-миграции применены.",
    details: [
      `Последняя миграция: ${latestLocal}.`,
      `Всего миграций: ${localMigrations.length}.`,
    ],
  }
}

async function checkCron(): Promise<Omit<SystemCheck, "id" | "label" | "ms">> {
  const details: string[] = []
  if (!process.env.CRON_SECRET) {
    details.push("CRON_SECRET не задан: cron endpoints должны требовать Bearer-секрет.")
  }

  const vercelPath = path.join(/* turbopackIgnore: true */ process.cwd(), "vercel.json")
  const vercelRaw = await readFile(vercelPath, "utf8").catch(() => null)
  if (!vercelRaw) {
    if (isProductionRuntime() && process.env.CRON_SECRET) {
      return {
        status: "ok",
        message: "Cron-секрет настроен. Source-check vercel.json пропущен в production bundle.",
        details: [
          "Vercel runtime не всегда содержит vercel.json как файл.",
          "Расписание cron проверяется локально/CI, runtime-защита проверена по CRON_SECRET.",
        ],
      }
    }

    return {
      status: "warning",
      message: "vercel.json не найден, расписание cron не проверено.",
      details,
    }
  }

  const vercel = JSON.parse(vercelRaw) as { crons?: Array<{ path?: string; schedule?: string }> }
  const configured = new Set((vercel.crons ?? []).map((cron) => cron.path).filter(Boolean))
  const missing = EXPECTED_CRONS.filter((cronPath) => !configured.has(cronPath))
  const routeMissing = isProductionRuntime() ? [] : await missingCronRoutes()

  if (missing.length > 0) details.push(`Нет расписания для: ${missing.join(", ")}.`)
  if (routeMissing.length > 0) details.push(`Не найдены route.ts для: ${routeMissing.join(", ")}.`)
  if (isProductionRuntime()) {
    details.push("Проверка route.ts пропущена в production bundle: Vercel runtime не обязан хранить исходники app/ как файлы.")
  }

  const blockingDetails = details.filter((detail) => !detail.includes("Проверка route.ts пропущена"))
  if (blockingDetails.length > 0) {
    return {
      status: process.env.CRON_SECRET ? "warning" : "error",
      message: process.env.CRON_SECRET
        ? "Cron настроен частично."
        : "Cron-секрет не настроен.",
      details,
    }
  }

  return {
    status: "ok",
    message: "Cron-секрет и расписания Vercel настроены.",
    details: [
      ...EXPECTED_CRONS.map((cronPath) => `Проверен ${cronPath}.`),
      ...details,
    ],
  }
}

async function checkEmail(): Promise<Omit<SystemCheck, "id" | "label" | "ms">> {
  const details: string[] = []
  if (!process.env.RESEND_API_KEY) details.push("RESEND_API_KEY не задан.")
  if (!process.env.EMAIL_FROM) details.push("EMAIL_FROM не задан.")

  if (details.length > 0) {
    return {
      status: "warning",
      message: "Email будет работать в ограниченном режиме.",
      details,
    }
  }

  const emailFrom = process.env.EMAIL_FROM ?? ""
  return {
    status: "ok",
    message: "Email-канал настроен.",
    details: [`Отправитель: ${maskEmail(emailFrom)}.`],
  }
}

async function checkStorage(): Promise<Omit<SystemCheck, "id" | "label" | "ms">> {
  const countRows = await db.$queryRaw<Array<{ count: number; bytes: number | null }>>`
    SELECT COUNT(*)::int AS count, COALESCE(SUM(file_size), 0)::int AS bytes
    FROM generated_documents
  `
  const row = countRows[0]
  const count = row?.count ?? 0
  const bytes = row?.bytes ?? 0

  return {
    status: "ok",
    message: "Документы сохраняются в базе данных.",
    details: [
      `Документов: ${count}.`,
      `Размер архива: ${formatBytes(bytes)}.`,
    ],
  }
}

async function checkDomainAndSeo(): Promise<Omit<SystemCheck, "id" | "label" | "ms">> {
  const details: string[] = []
  const rootHost = process.env.ROOT_HOST
  const nextAuthUrl = process.env.NEXTAUTH_URL

  if (!rootHost) details.push("ROOT_HOST не задан: subdomain routing может работать непредсказуемо.")
  if (!nextAuthUrl) details.push("NEXTAUTH_URL не задан: auth callbacks могут ломаться.")
  if (rootHost && nextAuthUrl && !hostMatches(rootHost, nextAuthUrl)) {
    details.push("ROOT_HOST и NEXTAUTH_URL указывают на разные домены.")
  }

  if (isProductionRuntime()) {
    details.push("Source-check app/sitemap.ts и app/robots.ts пропущен в production bundle; Next.js routes проверяются локально/CI.")
  } else {
    const sitemapExists = await fileExists(path.join(/* turbopackIgnore: true */ process.cwd(), "app", "sitemap.ts"))
    const robotsExists = await fileExists(path.join(/* turbopackIgnore: true */ process.cwd(), "app", "robots.ts"))

    if (!sitemapExists) details.push("app/sitemap.ts не найден.")
    if (!robotsExists) details.push("app/robots.ts не найден.")
  }

  const blockingDetails = details.filter((detail) => !detail.includes("Source-check"))
  if (blockingDetails.length > 0) {
    return {
      status: "warning",
      message: "SEO/домен требуют внимания.",
      details,
    }
  }

  return {
    status: "ok",
    message: "Доменная база, robots и sitemap присутствуют.",
    details: [
      `ROOT_HOST: ${rootHost}.`,
      "Sitemap: /sitemap.xml.",
      "Robots: /robots.txt.",
      ...details,
    ],
  }
}

async function checkObservability(): Promise<Omit<SystemCheck, "id" | "label" | "ms">> {
  const errorRoute = await fileExists(path.join(/* turbopackIgnore: true */ process.cwd(), "app", "api", "errors", "report", "route.ts"))
  const sentryConfigured = !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recentErrorCount = await db.auditLog.count({
    where: { action: "ERROR", createdAt: { gte: since } },
  }).catch(() => 0)

  if (!errorRoute && !sentryConfigured) {
    return {
      status: "warning",
      message: "Внешний и внутренний сбор ошибок не найдены.",
    }
  }

  if (!sentryConfigured) {
    return {
      status: "warning",
      message: "Работает внутренний журнал ошибок, Sentry пока не задан.",
      details: [
        "Для внешнего мониторинга задайте SENTRY_DSN или NEXT_PUBLIC_SENTRY_DSN.",
        `Ошибок за 24 часа в audit_logs: ${recentErrorCount}.`,
      ],
    }
  }

  if (recentErrorCount > 0) {
    return {
      status: "warning",
      message: "Сбор ошибок работает, но за последние 24 часа есть новые ошибки.",
      details: [
        `Ошибок за 24 часа в audit_logs: ${recentErrorCount}.`,
        "Откройте журнал операций и ищите action=ERROR или код ошибки из экрана.",
      ],
    }
  }

  return {
    status: "ok",
    message: "Сбор ошибок готов.",
    details: [
      errorRoute ? "Внутренний журнал ошибок включен." : "Внутренний endpoint не найден.",
      "Sentry DSN задан.",
      "Ошибок за 24 часа в audit_logs: 0.",
    ],
  }
}

async function getLocalMigrations(): Promise<string[]> {
  const migrationsDir = path.join(/* turbopackIgnore: true */ process.cwd(), "prisma", "migrations")
  const entries = await readdir(migrationsDir, { withFileTypes: true }).catch(() => [])
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

async function getDbMigrations(): Promise<MigrationRow[] | null> {
  return db.$queryRaw<MigrationRow[]>`
      SELECT migration_name, finished_at, rolled_back_at
      FROM "_prisma_migrations"
      ORDER BY migration_name ASC
    `.catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes("_prisma_migrations") || message.includes("relation")) {
        return null
      }
      throw error
    })
}

async function missingCronRoutes(): Promise<string[]> {
  const results = await Promise.all(
    EXPECTED_CRONS.map(async (cronPath) => {
      const routePath = path.join(/* turbopackIgnore: true */ process.cwd(), "app", ...cronPath.replace(/^\/api\//, "api/").split("/"), "route.ts")
      return (await fileExists(routePath)) ? null : cronPath
    })
  )
  return results.filter(Boolean) as string[]
}

async function fileExists(filePath: string): Promise<boolean> {
  return stat(filePath).then((item) => item.isFile()).catch(() => false)
}

async function sourceFileAvailable(...segments: string[]): Promise<boolean> {
  return fileExists(path.join(/* turbopackIgnore: true */ process.cwd(), ...segments))
}

async function readJson<T>(relativePath: string): Promise<T | null> {
  return readFile(path.join(/* turbopackIgnore: true */ process.cwd(), relativePath), "utf8")
    .then((value) => JSON.parse(value) as T)
    .catch(() => null)
}

function isProductionRuntime(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production"
}

function hostMatches(rootHost: string, nextAuthUrl: string): boolean {
  try {
    const normalizedRoot = rootHost.replace(/^https?:\/\//, "").replace(/\/$/, "")
    const authHost = new URL(nextAuthUrl).host
    return authHost === normalizedRoot || authHost.endsWith(`.${normalizedRoot}`)
  } catch {
    return false
  }
}

function limitTableList(tableNames: string[]): string {
  const visible = tableNames.slice(0, 12)
  const hidden = tableNames.length - visible.length
  return hidden > 0 ? `${visible.join(", ")} and ${hidden} more` : visible.join(", ")
}

function maskEmail(value: string): string {
  const [name, domain] = value.split("@")
  if (!name || !domain) return "configured"
  return `${name.slice(0, 2)}***@${domain}`
}

function formatSourceFile(file: { rel: string; size: number; isClient: boolean }): string {
  return `${Math.round(file.size / 1024)} KB ${file.rel}${file.isClient ? " [client]" : ""}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}
