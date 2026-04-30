// Включает Row Level Security на всех таблицах БД.
// Без политик — это значит "deny all для всех ролей кроме superuser".
// Наш Prisma подключается как postgres (BYPASSRLS) и продолжает работать.
// Anon-роль через Supabase REST API получит пустой результат на любой запрос.
//
// Использование:
//   node node_modules/tsx/dist/cli.mjs prisma/enable-rls.ts
import "dotenv/config"
import { PrismaClient } from "../app/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 30_000,
})
const adapter = new PrismaPg(pool)
const db = new PrismaClient({ adapter })

async function main() {
  // Получаем все таблицы из public схемы (актуальный список — на случай если
  // в БД появятся новые таблицы после миграций).
  const tables = await db.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  )

  console.log(`Found ${tables.length} tables in public schema`)

  let enabled = 0
  let already = 0
  let failed = 0

  for (const { tablename } of tables) {
    try {
      // Проверяем текущее состояние
      const status = await db.$queryRawUnsafe<{ rowsecurity: boolean }[]>(
        `SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = $1`,
        tablename
      )

      if (status[0]?.rowsecurity) {
        console.log(`  ⊙ ${tablename} — уже включён`)
        already++
        continue
      }

      await db.$executeRawUnsafe(`ALTER TABLE "${tablename}" ENABLE ROW LEVEL SECURITY`)
      console.log(`  ✓ ${tablename} — RLS включён`)
      enabled++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`  ✗ ${tablename} — ОШИБКА: ${msg}`)
      failed++
    }
  }

  console.log(`\nИтого: включено ${enabled}, уже было ${already}, ошибок ${failed}`)
  console.log(`\n⚠️  Prisma продолжит работать (postgres = BYPASSRLS).`)
  console.log(`    Доступ через Supabase REST API теперь блокируется.`)
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e)
  process.exit(1)
}).finally(() => db.$disconnect())
