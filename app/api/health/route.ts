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

    // 3. Проверяем наличие пользователей
    const { rows: users } = await client.query(
      "SELECT COUNT(*)::int as cnt FROM users"
    ).catch(() => ({ rows: [{ cnt: -1 }] }))

    return NextResponse.json({
      ok: true,
      url: maskedUrl,
      tables_found: tables,
      users_count: users[0]?.cnt ?? 0,
      message: users[0]?.cnt === 0
        ? "БД подключена, но пользователи не добавлены. Запустите POST /api/setup?secret=f16setup2024"
        : "БД подключена и готова к работе",
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
