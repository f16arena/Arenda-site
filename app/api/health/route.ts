import { NextResponse } from "next/server"
import { Pool } from "pg"

export const dynamic = "force-dynamic"

export async function GET() {
  const url = process.env.DATABASE_URL

  if (!url) {
    return NextResponse.json({
      ok: false,
      step: "env",
      error: "DATABASE_URL не задан в переменных окружения",
    }, { status: 500 })
  }

  // Маскируем пароль для вывода
  const maskedUrl = url.replace(/:([^@]+)@/, ":***@")

  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 5000,
  })

  // 1. Проверяем само подключение
  let client
  try {
    client = await pool.connect()
  } catch (e) {
    await pool.end().catch(() => {})
    return NextResponse.json({
      ok: false,
      step: "connect",
      url: maskedUrl,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }

  // 2. Проверяем наличие нужных таблиц
  try {
    const { rows } = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `)
    const tables = rows.map((r: { table_name: string }) => r.table_name)
    const required = ["users", "buildings", "floors", "spaces", "tenants"]
    const missing = required.filter((t) => !tables.includes(t))

    client.release()
    await pool.end().catch(() => {})

    if (missing.length > 0) {
      return NextResponse.json({
        ok: false,
        step: "schema",
        url: maskedUrl,
        error: `Таблицы не найдены: ${missing.join(", ")}. Запустите migrations/001_create_schema.sql в Supabase SQL Editor.`,
        tables_found: tables,
        tables_missing: missing,
      }, { status: 500 })
    }

    // 3. Проверяем наличие пользователей и новых колонок
    const { rows: users } = await client.query(
      "SELECT COUNT(*)::int as cnt FROM users"
    ).catch(() => ({ rows: [{ cnt: -1 }] }))

    // 4. Проверяем что миграция 004 прошла
    const { rows: tenantCols } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tenants'
      ORDER BY column_name
    `)
    const tenantColumns = tenantCols.map((r: { column_name: string }) => r.column_name)
    const requiredTenantCols = ["iin", "legal_address", "actual_address", "director_name", "director_position"]
    const missingTenantCols = requiredTenantCols.filter((c) => !tenantColumns.includes(c))

    const { rows: floorCols } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'floors'
    `)
    const floorColumns = floorCols.map((r: { column_name: string }) => r.column_name)
    const requiredFloorCols = ["fixed_monthly_rent", "full_floor_tenant_id"]
    const missingFloorCols = requiredFloorCols.filter((c) => !floorColumns.includes(c))

    const hasTariffs = tables.includes("tariffs")
    const migration004 = missingTenantCols.length === 0 && missingFloorCols.length === 0 && hasTariffs

    if (!migration004) {
      return NextResponse.json({
        ok: false,
        step: "migration_004",
        url: maskedUrl,
        error: "Миграция 004 не применена полностью. Запустите migrations/004_tariffs_and_tenant_fields.sql в Supabase.",
        has_tariffs_table: hasTariffs,
        missing_tenant_columns: missingTenantCols,
        missing_floor_columns: missingFloorCols,
      }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      url: maskedUrl,
      tables_found: tables,
      users_count: users[0]?.cnt ?? 0,
      migration_004_ok: true,
      message: users[0]?.cnt === 0
        ? "БД подключена, но пользователи не добавлены."
        : "БД подключена, миграция 004 применена.",
    })
  } catch (e) {
    client.release()
    await pool.end().catch(() => {})
    return NextResponse.json({
      ok: false,
      step: "query",
      url: maskedUrl,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}
