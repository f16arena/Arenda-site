// Импорт данных из Sydney-dump в текущую (Frankfurt) БД.
// Удаляет все данные кроме платформенного админа, потом заливает все таблицы из dump.
// Использование:
//   node node_modules/tsx/dist/cli.mjs prisma/import-from-sydney.ts

import "dotenv/config"
import * as fs from "fs"
import * as path from "path"
import { Pool } from "pg"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 30_000,
})

const dumpPath = path.join(__dirname, "sydney-dump.json")
// Файл может быть сохранён с UTF-8 BOM — снимаем перед парсингом
const raw = fs.readFileSync(dumpPath, "utf8").replace(/^﻿/, "")
const dump: Record<string, Array<Record<string, unknown>> | null> = JSON.parse(raw)

// Порядок учитывает FK зависимости.
// floors.full_floor_tenant_id и organizations.owner_user_id — циклические,
// заливаем без них, потом UPDATE в конце.
const TABLES_IN_ORDER = [
  "plans",
  "organizations",       // без owner_user_id
  "users",               // с organization_id
  "subscriptions",
  "buildings",
  "tariffs",
  "floors",              // без full_floor_tenant_id
  "spaces",
  "tenants",
  "staff",
  "contracts",
  "charges",
  "payments",
  "meters",
  "meter_readings",
  "tasks",
  "expenses",
  "salary_payments",
  "tenant_documents",
  "emergency_contacts",
  "leads",
  "role_permissions",
  "complaints",
  "requests",
  "request_comments",
] as const

// Колонки которые откладываем (циклические FK)
const DEFER_COLUMNS: Record<string, string[]> = {
  organizations: ["owner_user_id"],
  floors: ["full_floor_tenant_id"],
}

async function tableExists(name: string): Promise<boolean> {
  const r = await pool.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1",
    [name],
  )
  return r.rowCount! > 0
}

async function truncateAll() {
  console.log("\n🗑  Очистка Frankfurt-БД (без платформенных админов)...")

  // Сохраняем платформенных админов
  const platformOwners = await pool.query(
    "SELECT * FROM users WHERE is_platform_owner = true",
  )
  console.log(`  Сохраню ${platformOwners.rowCount} платформенных админов`)

  // Удаляем в обратном порядке зависимостей
  const reverse = [...TABLES_IN_ORDER].reverse()
  for (const t of reverse) {
    if (!(await tableExists(t))) continue
    if (t === "users") {
      // Удаляем только не-платформенных
      const r = await pool.query("DELETE FROM users WHERE is_platform_owner = false")
      console.log(`  -${t}: ${r.rowCount} удалено`)
    } else {
      const r = await pool.query(`DELETE FROM "${t}"`)
      console.log(`  -${t}: ${r.rowCount} удалено`)
    }
  }

  return platformOwners.rows
}

async function insertTable(name: string, rows: Array<Record<string, unknown>>) {
  if (!rows || rows.length === 0) return 0

  const deferCols = DEFER_COLUMNS[name] ?? []
  let inserted = 0

  for (const row of rows) {
    const filtered = Object.fromEntries(
      Object.entries(row).filter(([k]) => !deferCols.includes(k)),
    )
    const cols = Object.keys(filtered)
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ")
    const colList = cols.map((c) => `"${c}"`).join(", ")
    const values = Object.values(filtered)

    try {
      await pool.query(
        `INSERT INTO "${name}" (${colList}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
        values,
      )
      inserted++
    } catch (e) {
      console.error(`    ✗ ${name} row id=${(row as { id?: string }).id}: ${e instanceof Error ? e.message : e}`)
    }
  }
  return inserted
}

async function fillDeferred() {
  console.log("\n🔄 Восстановление циклических FK...")

  // organizations.owner_user_id
  for (const org of dump.organizations ?? []) {
    if (org.owner_user_id) {
      await pool.query("UPDATE organizations SET owner_user_id=$1 WHERE id=$2", [
        org.owner_user_id,
        org.id,
      ])
      console.log(`  organizations.owner_user_id для ${org.slug} → ${org.owner_user_id}`)
    }
  }

  // floors.full_floor_tenant_id
  let floorsUpdated = 0
  for (const f of dump.floors ?? []) {
    if (f.full_floor_tenant_id) {
      await pool.query("UPDATE floors SET full_floor_tenant_id=$1 WHERE id=$2", [
        f.full_floor_tenant_id,
        f.id,
      ])
      floorsUpdated++
    }
  }
  if (floorsUpdated > 0) console.log(`  floors.full_floor_tenant_id: ${floorsUpdated} обновлено`)
}

async function main() {
  console.log("📦 Импорт Sydney → Frankfurt")
  console.log(`   Источник: ${dumpPath}`)

  console.time("total")

  const platformOwners = await truncateAll()

  console.log("\n📥 Импорт таблиц в порядке зависимостей:")
  for (const name of TABLES_IN_ORDER) {
    const rows = dump[name] ?? []
    if (rows.length === 0) {
      console.log(`  ${name}: (пусто)`)
      continue
    }
    if (!(await tableExists(name))) {
      console.log(`  ${name}: (таблица не существует — пропуск)`)
      continue
    }
    const ins = await insertTable(name, rows)
    console.log(`  ${name}: ${ins}/${rows.length} ✓`)
  }

  await fillDeferred()

  // Гарантия: платформенные админы остались (мы их не удаляли, но проверим)
  const platformAfter = await pool.query("SELECT count(*) FROM users WHERE is_platform_owner = true")
  console.log(`\n👑 Платформенных админов сейчас: ${platformAfter.rows[0].count} (было ${platformOwners.length})`)

  console.timeEnd("total")
  console.log("\n✅ Импорт завершён.")
  console.log("\nДальше:")
  console.log("  1. node node_modules/tsx/dist/cli.mjs prisma/setup-f16.ts")
  console.log("     (на случай если slug/префикс/orphan-связи нужно ещё раз поправить)")
  console.log("  2. node node_modules/tsx/dist/cli.mjs prisma/check-data.ts")
  console.log("     (проверить что есть)")
}

main()
  .catch((e) => {
    console.error("FATAL:", e instanceof Error ? e.message : e)
    process.exit(1)
  })
  .finally(() => pool.end())
