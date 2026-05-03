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
  "NEXTAUTH_URL",
  "ROOT_HOST",
  "CRON_SECRET",
] as const

const REQUIRED_TABLES = [
  "organizations",
  "users",
  "buildings",
  "floors",
  "spaces",
  "tenants",
  "charges",
  "payments",
  "contracts",
  "generated_documents",
  "audit_logs",
  "email_logs",
  "user_building_access",
] as const

const EXPECTED_CRONS = [
  "/api/cron/check-deadlines",
  "/api/cron/monthly-invoices",
  "/api/cron/check-subscriptions",
] as const

export async function runSystemHealthChecks(): Promise<SystemCheck[]> {
  const checks = await Promise.all([
    withTiming("env", "Переменные окружения", checkEnvironment),
    withTiming("database", "База данных", checkDatabase),
    withTiming("schema", "Prisma-схема и таблицы", checkSchemaTables),
    withTiming("rls", "Supabase RLS", checkSensitiveRls),
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
  const rows = await db.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `
  const tables = rows.map((row) => row.table_name)
  const missing = REQUIRED_TABLES.filter((table) => !tables.includes(table))

  if (missing.length > 0) {
    return {
      status: "error",
      message: "В базе не найдены обязательные таблицы.",
      details: [
        `Отсутствуют: ${missing.join(", ")}.`,
        `Найдено таблиц: ${tables.length}.`,
      ],
    }
  }

  return {
    status: "ok",
    message: "Ключевые таблицы актуальной Prisma-схемы найдены.",
    details: [`Проверено таблиц: ${REQUIRED_TABLES.length}.`],
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

async function checkMigrations(): Promise<Omit<SystemCheck, "id" | "label" | "ms">> {
  const localMigrations = await getLocalMigrations()
  if (localMigrations.length === 0) {
    return {
      status: "warning",
      message: "Локальные Prisma-миграции не найдены.",
    }
  }

  const dbMigrations = await db.$queryRaw<MigrationRow[]>`
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

  const vercelPath = path.join(process.cwd(), "vercel.json")
  const vercelRaw = await readFile(vercelPath, "utf8").catch(() => null)
  if (!vercelRaw) {
    return {
      status: "warning",
      message: "vercel.json не найден, расписание cron не проверено.",
      details,
    }
  }

  const vercel = JSON.parse(vercelRaw) as { crons?: Array<{ path?: string; schedule?: string }> }
  const configured = new Set((vercel.crons ?? []).map((cron) => cron.path).filter(Boolean))
  const missing = EXPECTED_CRONS.filter((cronPath) => !configured.has(cronPath))
  const routeMissing = await missingCronRoutes()

  if (missing.length > 0) details.push(`Нет расписания для: ${missing.join(", ")}.`)
  if (routeMissing.length > 0) details.push(`Не найдены route.ts для: ${routeMissing.join(", ")}.`)

  if (details.length > 0) {
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
    details: EXPECTED_CRONS.map((cronPath) => `Проверен ${cronPath}.`),
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

  const sitemapExists = await fileExists(path.join(process.cwd(), "app", "sitemap.ts"))
  const robotsExists = await fileExists(path.join(process.cwd(), "app", "robots.ts"))

  if (!sitemapExists) details.push("app/sitemap.ts не найден.")
  if (!robotsExists) details.push("app/robots.ts не найден.")

  if (details.length > 0) {
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
    ],
  }
}

async function checkObservability(): Promise<Omit<SystemCheck, "id" | "label" | "ms">> {
  const errorRoute = await fileExists(path.join(process.cwd(), "app", "api", "errors", "report", "route.ts"))
  const sentryConfigured = !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN)

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
      details: ["Для внешнего мониторинга задайте SENTRY_DSN или NEXT_PUBLIC_SENTRY_DSN."],
    }
  }

  return {
    status: "ok",
    message: "Сбор ошибок готов.",
    details: [errorRoute ? "Внутренний журнал ошибок включен." : "Внутренний endpoint не найден.", "Sentry DSN задан."],
  }
}

async function getLocalMigrations(): Promise<string[]> {
  const migrationsDir = path.join(process.cwd(), "prisma", "migrations")
  const entries = await readdir(migrationsDir, { withFileTypes: true }).catch(() => [])
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

async function missingCronRoutes(): Promise<string[]> {
  const results = await Promise.all(
    EXPECTED_CRONS.map(async (cronPath) => {
      const routePath = path.join(process.cwd(), "app", ...cronPath.replace(/^\/api\//, "api/").split("/"), "route.ts")
      return (await fileExists(routePath)) ? null : cronPath
    })
  )
  return results.filter(Boolean) as string[]
}

async function fileExists(filePath: string): Promise<boolean> {
  return stat(filePath).then((item) => item.isFile()).catch(() => false)
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}
