// Проверяет, отвечает ли Sydney pooler сейчас.
// Возвращает данные если связь есть, иначе — пишет ошибку.
import "dotenv/config"
import { Pool } from "pg"

const SYDNEY_URL = "postgresql://postgres.axbewlrmwabqjpmxedps:mSo5Otai9RVt6Lpu@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres"

const pool = new Pool({
  connectionString: SYDNEY_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 20_000,
})

async function main() {
  console.time("connect")
  try {
    const r = await pool.query("SELECT version() as v, current_database() as db, count(*) as users FROM users")
    console.timeEnd("connect")
    console.log("✓ Sydney отвечает!")
    console.log("  version:", r.rows[0].v.slice(0, 60))
    console.log("  db:", r.rows[0].db)
    console.log("  users count:", r.rows[0].users)

    const orgs = await pool.query("SELECT slug, name FROM organizations")
    console.log("\norganizations:", orgs.rows)

    const tables = await pool.query(`
      SELECT tablename, (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I', tablename), false, true, '')))[1]::text::int AS rows
      FROM pg_tables WHERE schemaname='public'
      ORDER BY tablename
    `)
    console.log("\nTable row counts:")
    for (const t of tables.rows) console.log(`  ${t.tablename}: ${t.rows}`)
  } catch (e) {
    console.timeEnd("connect")
    console.error("✗ Sydney не отвечает:", e instanceof Error ? e.message : e)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
