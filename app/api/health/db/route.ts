import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

const REQUIRED_HEALTH_SCHEMA = [
  { kind: "table", table: "payment_reports" },
  { kind: "table", table: "stored_files" },
  { kind: "table", table: "tenant_spaces" },
  { kind: "table", table: "tenant_bank_accounts" },
  { kind: "table", table: "address_cache" },
  { kind: "table", table: "web_vital_metrics" },
  { kind: "column", table: "buildings", column: "address_country_code" },
  { kind: "column", table: "buildings", column: "address_source_id" },
  { kind: "column", table: "organizations", column: "second_bank_name" },
  { kind: "column", table: "payment_reports", column: "method" },
  { kind: "column", table: "payment_reports", column: "receipt_file_id" },
  { kind: "column", table: "stored_files", column: "building_id" },
  { kind: "column", table: "stored_files", column: "tenant_id" },
  { kind: "column", table: "stored_files", column: "visibility" },
  { kind: "column", table: "floors", column: "full_floor_tenant_id" },
  { kind: "column", table: "tenant_spaces", column: "space_id" },
  { kind: "column", table: "tenant_bank_accounts", column: "tenant_id" },
  { kind: "column", table: "tenant_bank_accounts", column: "is_primary" },
  { kind: "column", table: "address_cache", column: "query_key" },
  { kind: "column", table: "web_vital_metrics", column: "name" },
] as const

// GET /api/health/db
// Подробная диагностика подключения к БД, без авторизации.
// Открывайте на Vercel https://your-app.vercel.app/api/health/db чтобы увидеть статус.
export async function GET() {
  const checks: { name: string; ok: boolean; ms: number; result?: unknown; error?: string }[] = []

  // 1. Простейший SELECT 1
  let t0 = Date.now()
  try {
    const r = await db.$queryRawUnsafe<{ ok: number }[]>("SELECT 1 as ok")
    checks.push({ name: "select_1", ok: true, ms: Date.now() - t0, result: r })
  } catch (e) {
    checks.push({
      name: "select_1",
      ok: false,
      ms: Date.now() - t0,
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    })
  }

  // 2. Версия Postgres
  t0 = Date.now()
  try {
    const r = await db.$queryRawUnsafe<{ version: string }[]>("SELECT version()")
    checks.push({ name: "version", ok: true, ms: Date.now() - t0, result: r[0]?.version })
  } catch (e) {
    checks.push({
      name: "version",
      ok: false,
      ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    })
  }

  // 3. Счёт организаций
  t0 = Date.now()
  try {
    const count = await db.organization.count()
    checks.push({ name: "organization_count", ok: true, ms: Date.now() - t0, result: count })
  } catch (e) {
    checks.push({
      name: "organization_count",
      ok: false,
      ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    })
  }

  // 4. Счёт пользователей
  t0 = Date.now()
  try {
    const count = await db.user.count()
    checks.push({ name: "user_count", ok: true, ms: Date.now() - t0, result: count })
  } catch (e) {
    checks.push({
      name: "user_count",
      ok: false,
      ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    })
  }

  // 5. Быстрая проверка схемы после свежих релизов.
  t0 = Date.now()
  try {
    const missing = await findMissingRequiredSchema()
    checks.push({
      name: "required_schema_1_3_49",
      ok: missing.length === 0,
      ms: Date.now() - t0,
      result: {
        checked: REQUIRED_HEALTH_SCHEMA.length,
        missing,
        fix: missing.length > 0 ? "Run `prisma migrate deploy` before serving the new build." : "schema_ok",
      },
    })
  } catch (e) {
    checks.push({
      name: "required_schema_1_3_47",
      ok: false,
      ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    })
  }

  const env = {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL ?? null,
    VERCEL_REGION: process.env.VERCEL_REGION ?? null,
    DATABASE_URL_HOST: parseHost(process.env.DATABASE_URL),
    ROOT_HOST: process.env.ROOT_HOST ?? "(default: commrent.kz)",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? null,
    AUTH_SECRET_set: !!process.env.AUTH_SECRET,
  }

  const ok = checks.every((c) => c.ok)

  return NextResponse.json({
    ok,
    timestamp: new Date().toISOString(),
    env,
    checks,
  }, { status: ok ? 200 : 503 })
}

// Извлекает host:port из URL без раскрытия пароля
function parseHost(url: string | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return `${u.hostname}:${u.port || "5432"}`
  } catch {
    return "invalid"
  }
}

async function findMissingRequiredSchema(): Promise<string[]> {
  const [tableRows, columnRows] = await Promise.all([
    db.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `,
    db.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `,
  ])

  const tables = new Set(tableRows.map((row) => row.table_name))
  const columnsByTable = new Map<string, Set<string>>()
  for (const row of columnRows) {
    const columns = columnsByTable.get(row.table_name) ?? new Set<string>()
    columns.add(row.column_name)
    columnsByTable.set(row.table_name, columns)
  }

  return REQUIRED_HEALTH_SCHEMA.flatMap((item) => {
    if (item.kind === "table") return tables.has(item.table) ? [] : [`table:${item.table}`]
    const columns = columnsByTable.get(item.table)
    return columns?.has(item.column) ? [] : [`column:${item.table}.${item.column}`]
  })
}
