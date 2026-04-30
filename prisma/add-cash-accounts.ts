// Миграция: добавляет таблицы cash_accounts и cash_transactions.
// Также seed дефолтных счетов для существующих организаций (Касса + Банк).
import "dotenv/config"
import { Pool } from "pg"
import crypto from "crypto"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 30_000,
})

function cuid(): string {
  return "c" + crypto.randomBytes(12).toString("hex")
}

async function main() {
  const client = await pool.connect()
  try {
    console.log("Создаю таблицы cash_accounts и cash_transactions...")

    await client.query(`
      CREATE TABLE IF NOT EXISTS "cash_accounts" (
        "id" TEXT PRIMARY KEY,
        "organization_id" TEXT NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
        "name" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "currency" TEXT NOT NULL DEFAULT 'KZT',
        "notes" TEXT,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "cash_accounts_organization_id_idx" ON "cash_accounts"("organization_id");
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS "cash_transactions" (
        "id" TEXT PRIMARY KEY,
        "account_id" TEXT NOT NULL REFERENCES "cash_accounts"("id") ON DELETE CASCADE,
        "amount" DOUBLE PRECISION NOT NULL,
        "type" TEXT NOT NULL,
        "description" TEXT,
        "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "created_by_id" TEXT,
        "payment_id" TEXT,
        "expense_id" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS "cash_transactions_account_date_idx" ON "cash_transactions"("account_id", "date");
    `)

    // Включаем RLS на новых таблицах
    await client.query(`
      ALTER TABLE "cash_accounts" ENABLE ROW LEVEL SECURITY;
      ALTER TABLE "cash_transactions" ENABLE ROW LEVEL SECURITY;
    `)

    console.log("✓ Таблицы созданы")

    // Seed: для каждой организации без счетов создаём 2 дефолтных
    const orgs = await client.query<{ id: string; name: string }>(`
      SELECT o.id, o.name
      FROM organizations o
      WHERE NOT EXISTS (
        SELECT 1 FROM cash_accounts ca WHERE ca.organization_id = o.id
      )
    `)

    if (orgs.rows.length === 0) {
      console.log("\nВсе организации уже имеют счета")
    } else {
      console.log(`\nДобавляю дефолтные счета для ${orgs.rows.length} организаций...`)
      for (const org of orgs.rows) {
        await client.query(
          `INSERT INTO cash_accounts (id, organization_id, name, type, balance) VALUES
           ($1, $2, 'Расчётный счёт', 'BANK', 0),
           ($3, $2, 'Касса', 'CASH', 0)`,
          [cuid(), org.id, cuid()]
        )
        console.log(`  ✓ ${org.name}: Расчётный счёт + Касса`)
      }
    }

    console.log("\n✓ Миграция завершена")
  } finally {
    client.release()
  }
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e)
  process.exit(1)
}).finally(() => pool.end())
