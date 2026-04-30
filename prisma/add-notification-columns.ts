// Миграция: добавляет колонки notify_* в таблицу users.
// node node_modules/tsx/dist/cli.mjs prisma/add-notification-columns.ts
import "dotenv/config"
import { Pool } from "pg"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 30_000,
})

async function main() {
  const client = await pool.connect()
  try {
    console.log("Применяю миграцию для notification settings...")

    await client.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "notify_email" BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "notify_telegram" BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "notify_in_app" BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "notify_muted_types" JSONB
    `)

    console.log("✓ Колонки добавлены (или уже существовали)")

    const r = await client.query(`
      SELECT column_name, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name LIKE 'notify_%'
      ORDER BY column_name
    `)
    console.log("Состояние notify-колонок в БД:")
    for (const row of r.rows) {
      console.log(`  ${row.column_name} :: ${row.data_type}${row.column_default ? ` = ${row.column_default}` : ""}`)
    }
  } finally {
    client.release()
  }
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e)
  process.exit(1)
}).finally(() => pool.end())
