// Опционально: пересчитывает balance счетов из существующих Payment / Expense.
// Для каждой организации:
//   1) Сбрасывает balance всех активных счетов в 0 и удаляет все CashTransaction
//   2) Создаёт DEPOSIT-транзакции для всех Payment арендаторов в дефолтный BANK счёт
//   3) Создаёт WITHDRAW-транзакции для всех Expense в дефолтный BANK счёт
//   4) Пересчитывает balance счетов
//
// БЕРЕЖНО: после запуска все ручные корректировки баланса (через UI) исчезнут.
// Запускать только если хочешь видеть в Cash Account реальную историю по платежам.
//
// Использование:
//   node node_modules/tsx/dist/cli.mjs prisma/backfill-cash-accounts.ts <orgId>
//   node node_modules/tsx/dist/cli.mjs prisma/backfill-cash-accounts.ts --all
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

async function processOrg(orgId: string) {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true },
  })
  if (!org) {
    console.log(`✗ Орг ${orgId} не найдена`)
    return
  }

  console.log(`\n--- ${org.name} (${orgId}) ---`)

  // Найти дефолтные счета
  const accounts = await db.cashAccount.findMany({
    where: { organizationId: orgId, isActive: true },
    orderBy: { createdAt: "asc" },
  })
  if (accounts.length === 0) {
    console.log(`  ✗ Нет активных счетов. Пропускаю.`)
    return
  }

  const bankAccount = accounts.find((a) => a.type === "BANK") ?? accounts[0]
  console.log(`  Использую счёт: ${bankAccount.name} (${bankAccount.type})`)

  // 1) Удалить все существующие транзакции и сбросить баланс
  for (const a of accounts) {
    await db.cashTransaction.deleteMany({ where: { accountId: a.id } })
    await db.cashAccount.update({ where: { id: a.id }, data: { balance: 0 } })
  }

  // 2) Найти все платежи орги (через tenant → space → floor → building)
  const payments = await db.payment.findMany({
    where: {
      tenant: {
        OR: [
          { space: { floor: { building: { organizationId: orgId } } } },
          { fullFloors: { some: { building: { organizationId: orgId } } } },
        ],
      },
    },
    select: {
      id: true, amount: true, paymentDate: true, method: true,
      tenant: { select: { companyName: true } },
    },
    orderBy: { paymentDate: "asc" },
  })

  console.log(`  Платежей: ${payments.length}`)
  let depositTotal = 0
  for (const p of payments) {
    await db.cashTransaction.create({
      data: {
        accountId: bankAccount.id,
        amount: p.amount,
        type: "DEPOSIT",
        description: `Backfill: платёж от ${p.tenant.companyName} (${p.method})`,
        date: p.paymentDate,
        paymentId: p.id,
      },
    })
    depositTotal += p.amount
  }

  // 3) Расходы орги (через building.organizationId)
  const expenses = await db.expense.findMany({
    where: { building: { organizationId: orgId } },
    select: { id: true, amount: true, date: true, category: true, description: true },
    orderBy: { date: "asc" },
  })
  console.log(`  Расходов: ${expenses.length}`)
  let withdrawTotal = 0
  for (const e of expenses) {
    await db.cashTransaction.create({
      data: {
        accountId: bankAccount.id,
        amount: -e.amount,
        type: "WITHDRAW",
        description: `Backfill: ${e.description ?? e.category}`,
        date: e.date,
        expenseId: e.id,
      },
    })
    withdrawTotal += e.amount
  }

  // 4) Установить итоговый баланс
  const finalBalance = depositTotal - withdrawTotal
  await db.cashAccount.update({
    where: { id: bankAccount.id },
    data: { balance: finalBalance },
  })

  console.log(`  → Поступления: ${depositTotal.toLocaleString("ru-RU")} ₸`)
  console.log(`  → Расходы:     ${withdrawTotal.toLocaleString("ru-RU")} ₸`)
  console.log(`  → Итого:       ${finalBalance.toLocaleString("ru-RU")} ₸ → ${bankAccount.name}`)
}

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error("Использование: node prisma/backfill-cash-accounts.ts <orgId> | --all")
    process.exit(1)
  }

  if (arg === "--all") {
    const orgs = await db.organization.findMany({ select: { id: true, name: true } })
    console.log(`Найдено ${orgs.length} организаций. Запускаю backfill для всех.`)
    for (const o of orgs) {
      await processOrg(o.id)
    }
  } else {
    await processOrg(arg)
  }

  console.log("\n✓ Готово")
}

main().catch((e) => {
  console.error("ERROR:", e instanceof Error ? e.message : e)
  process.exit(1)
}).finally(() => db.$disconnect())
