import { config } from "dotenv"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

import { PrismaClient } from "../app/generated/prisma/client"
import { recordPaymentCash, reversePaymentCash, reapplyPaymentCash } from "../lib/payment-cash"
import type { TxClient } from "../lib/db"

config({ path: ".env.local" })
config({ path: ".env" })

// E2E для инварианта кассы (см. AUDIT_2026-05-29, проблема #5):
//   record → баланс += amount, проводка с paymentId
//   delete → баланс -= amount (проводка остаётся)
//   restore → баланс += amount
//   bulk delete → баланс -= сумма
// Тест зовёт ТЕ ЖЕ helper-ы (lib/payment-cash), что и server actions, поэтому
// ловит регрессии в record/delete/restore-логике.

const RUN_FLAG = "RUN_E2E_CASH"
const WRITE_FLAG = "E2E_ALLOW_DB_WRITE"
const URL_ENV = "E2E_DATABASE_URL"

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function assertSafeDatabaseUrl(e2eDatabaseUrl: string) {
  if (process.env[WRITE_FLAG] !== "1") {
    throw new Error(`${WRITE_FLAG}=1 is required because this test writes and cleans up records`)
  }
  const applicationUrl = process.env.DATABASE_URL
  if (
    applicationUrl &&
    e2eDatabaseUrl === applicationUrl &&
    process.env.E2E_ALLOW_PRODUCTION_URL !== "1"
  ) {
    throw new Error(
      `${URL_ENV} matches DATABASE_URL. Use a staging/test database, or set E2E_ALLOW_PRODUCTION_URL=1 intentionally.`,
    )
  }
}

function assertEqual(actual: number, expected: number, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`)
  }
}

async function main() {
  if (process.env[RUN_FLAG] !== "1") {
    console.log(`[e2e-cash-balance] skipped: set ${RUN_FLAG}=1 to run against a staging database`)
    return
  }

  const databaseUrl = requireEnv(URL_ENV)
  assertSafeDatabaseUrl(databaseUrl)

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 30_000,
    statement_timeout: 30_000,
  })
  const db = new PrismaClient({ adapter: new PrismaPg(pool) })

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const digits = stamp.replace(/\D/g, "").slice(-7).padStart(7, "0")
  const amount = 100_000
  const ids: Record<string, string | undefined> = {}
  const paymentIds: string[] = []

  try {
    const organization = await db.organization.create({
      data: { name: `E2E Cash Org ${stamp}`, slug: `e2e-cash-${stamp}` },
    })
    ids.organizationId = organization.id

    const tenantUser = await db.user.create({
      data: {
        name: "E2E Cash Tenant",
        email: `cash-tenant-${stamp}@example.test`,
        phone: `+7702${digits}`,
        password: "e2e-not-a-real-password",
        role: "TENANT",
        organizationId: organization.id,
      },
    })
    ids.tenantUserId = tenantUser.id

    const building = await db.building.create({
      data: {
        organizationId: organization.id,
        name: "E2E Cash Building",
        address: "Kazakhstan, Astana, E2E street 1",
      },
    })
    ids.buildingId = building.id

    const floor = await db.floor.create({
      data: { buildingId: building.id, number: 1, name: "1 floor", ratePerSqm: 2_500, totalArea: 50 },
    })
    ids.floorId = floor.id

    const space = await db.space.create({
      data: { floorId: floor.id, number: "101", area: 50, status: "OCCUPIED" },
    })
    ids.spaceId = space.id

    const tenant = await db.tenant.create({
      data: {
        userId: tenantUser.id,
        spaceId: space.id,
        companyName: "E2E Cash Tenant LLP",
        legalType: "TOO",
        bin: "000000000000",
        fixedMonthlyRent: amount,
        paymentDueDay: 10,
        penaltyPercent: 1,
      },
    })
    ids.tenantId = tenant.id

    const cashAccount = await db.cashAccount.create({
      data: { organizationId: organization.id, name: "E2E Cashbox", type: "CASH", balance: 0 },
    })
    ids.cashAccountId = cashAccount.id

    const tx = db as unknown as TxClient

    // 1. record: создаём платёж + кассовую проводку → баланс += amount
    const payment = await db.payment.create({
      data: { tenantId: tenant.id, amount, method: "CASH", paymentDate: new Date("2099-01-05T00:00:00.000Z") },
    })
    paymentIds.push(payment.id)
    await recordPaymentCash(tx, {
      paymentId: payment.id,
      cashAccountId: cashAccount.id,
      amount,
      description: "E2E cash payment",
    })

    const afterRecord = await db.cashAccount.findUniqueOrThrow({ where: { id: cashAccount.id } })
    assertEqual(afterRecord.balance, amount, "balance after record")

    const linkedTx = await db.cashTransaction.findMany({ where: { paymentId: payment.id } })
    if (linkedTx.length !== 1) throw new Error(`expected 1 cash transaction linked by paymentId, got ${linkedTx.length}`)
    if (linkedTx[0].amount !== amount) throw new Error("linked cash transaction amount mismatch")

    // 2. delete: soft-delete платежа + откат баланса (проводка остаётся)
    await db.$transaction(async (innerTx) => {
      await innerTx.payment.update({ where: { id: payment.id }, data: { deletedAt: new Date() } })
      await reversePaymentCash(innerTx as unknown as TxClient, payment.id)
    })
    const afterDelete = await db.cashAccount.findUniqueOrThrow({ where: { id: cashAccount.id } })
    assertEqual(afterDelete.balance, 0, "balance after delete")
    const keptTx = await db.cashTransaction.findMany({ where: { paymentId: payment.id } })
    if (keptTx.length !== 1) throw new Error("cash transaction must be kept after delete (for restore)")

    // 3. restore: возврат платежа + возврат баланса
    await db.$transaction(async (innerTx) => {
      await innerTx.payment.update({ where: { id: payment.id }, data: { deletedAt: null } })
      await reapplyPaymentCash(innerTx as unknown as TxClient, payment.id)
    })
    const afterRestore = await db.cashAccount.findUniqueOrThrow({ where: { id: cashAccount.id } })
    assertEqual(afterRestore.balance, amount, "balance after restore")

    // 4. bulk delete: два платежа → баланс 3*amount, bulk reverse → amount
    for (let i = 0; i < 2; i++) {
      const p = await db.payment.create({
        data: { tenantId: tenant.id, amount, method: "CASH", paymentDate: new Date("2099-01-06T00:00:00.000Z") },
      })
      paymentIds.push(p.id)
      await recordPaymentCash(tx, { paymentId: p.id, cashAccountId: cashAccount.id, amount, description: `E2E bulk ${i}` })
    }
    const beforeBulk = await db.cashAccount.findUniqueOrThrow({ where: { id: cashAccount.id } })
    assertEqual(beforeBulk.balance, amount * 3, "balance before bulk delete")

    const bulkIds = paymentIds.slice(1) // два «bulk» платежа
    await db.$transaction(async (innerTx) => {
      await innerTx.payment.updateMany({ where: { id: { in: bulkIds } }, data: { deletedAt: new Date() } })
      await reversePaymentCash(innerTx as unknown as TxClient, bulkIds)
    })
    const afterBulk = await db.cashAccount.findUniqueOrThrow({ where: { id: cashAccount.id } })
    assertEqual(afterBulk.balance, amount, "balance after bulk delete")

    console.log("[e2e-cash-balance] passed")
  } finally {
    if (paymentIds.length > 0) {
      await db.cashTransaction.deleteMany({ where: { paymentId: { in: paymentIds } } })
      await db.payment.deleteMany({ where: { id: { in: paymentIds } } })
    }
    if (ids.cashAccountId) await db.cashAccount.deleteMany({ where: { id: ids.cashAccountId } })
    if (ids.tenantId) await db.tenant.deleteMany({ where: { id: ids.tenantId } })
    if (ids.spaceId) await db.space.deleteMany({ where: { id: ids.spaceId } })
    if (ids.floorId) await db.floor.deleteMany({ where: { id: ids.floorId } })
    if (ids.buildingId) await db.building.deleteMany({ where: { id: ids.buildingId } })
    if (ids.tenantUserId) await db.user.deleteMany({ where: { id: ids.tenantUserId } })
    if (ids.organizationId) await db.organization.deleteMany({ where: { id: ids.organizationId } })
    await db.$disconnect()
    await pool.end()
  }
}

main().catch((error) => {
  console.error("[e2e-cash-balance] failed")
  console.error(error)
  process.exit(1)
})
