import { config } from "dotenv"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

import { PrismaClient } from "../app/generated/prisma/client"
import { applyConfirmedPaymentReport } from "../lib/payment-report-workflow"

config({ path: ".env.local" })
config({ path: ".env" })

const RUN_FLAG = "RUN_E2E_PAYMENT"
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

async function main() {
  if (process.env[RUN_FLAG] !== "1") {
    console.log(`[e2e-critical-payment] skipped: set ${RUN_FLAG}=1 to run against a staging database`)
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
  const orgSlug = `e2e-payment-${stamp}`
  const amount = 125_000
  const ids: Record<string, string | undefined> = {}

  try {
    const organization = await db.organization.create({
      data: {
        name: `E2E Payment Org ${stamp}`,
        slug: orgSlug,
      },
    })
    ids.organizationId = organization.id

    const adminUser = await db.user.create({
      data: {
        name: "E2E Admin",
        email: `admin-${stamp}@example.test`,
        phone: `+7700${stamp.replace(/\D/g, "").slice(-7).padStart(7, "0")}`,
        password: "e2e-not-a-real-password",
        role: "ADMIN",
        organizationId: organization.id,
      },
    })
    ids.adminUserId = adminUser.id

    const tenantUser = await db.user.create({
      data: {
        name: "E2E Tenant",
        email: `tenant-${stamp}@example.test`,
        phone: `+7701${stamp.replace(/\D/g, "").slice(-7).padStart(7, "0")}`,
        password: "e2e-not-a-real-password",
        role: "TENANT",
        organizationId: organization.id,
      },
    })
    ids.tenantUserId = tenantUser.id

    const building = await db.building.create({
      data: {
        organizationId: organization.id,
        name: "E2E Building",
        address: "Kazakhstan, Astana, E2E street 1",
        administratorUserId: adminUser.id,
      },
    })
    ids.buildingId = building.id

    const buildingAccess = await db.userBuildingAccess.create({
      data: {
        userId: adminUser.id,
        buildingId: building.id,
      },
    })
    ids.buildingAccessId = buildingAccess.id

    const floor = await db.floor.create({
      data: {
        buildingId: building.id,
        number: 1,
        name: "1 floor",
        ratePerSqm: 2_500,
        totalArea: 50,
      },
    })
    ids.floorId = floor.id

    const space = await db.space.create({
      data: {
        floorId: floor.id,
        number: "101",
        area: 50,
        status: "OCCUPIED",
      },
    })
    ids.spaceId = space.id

    const tenant = await db.tenant.create({
      data: {
        userId: tenantUser.id,
        spaceId: space.id,
        companyName: "E2E Tenant LLP",
        legalType: "TOO",
        bin: "000000000000",
        fixedMonthlyRent: amount,
        paymentDueDay: 10,
        penaltyPercent: 1,
      },
    })
    ids.tenantId = tenant.id

    const charge = await db.charge.create({
      data: {
        tenantId: tenant.id,
        period: "2099-01",
        type: "RENT",
        amount,
        description: "E2E rent charge",
        dueDate: new Date("2099-01-10T00:00:00.000Z"),
      },
    })
    ids.chargeId = charge.id

    const cashAccount = await db.cashAccount.create({
      data: {
        organizationId: organization.id,
        name: "E2E Cashbox",
        type: "CASH",
        balance: 0,
      },
    })
    ids.cashAccountId = cashAccount.id

    const paymentReport = await db.paymentReport.create({
      data: {
        tenantId: tenant.id,
        userId: tenantUser.id,
        amount,
        paymentDate: new Date("2099-01-05T00:00:00.000Z"),
        method: "CASH",
        status: "PENDING",
        paymentPurpose: "E2E rent payment",
      },
      include: {
        tenant: { select: { companyName: true } },
      },
    })
    ids.paymentReportId = paymentReport.id

    const payment = await db.$transaction(async (tx) =>
      applyConfirmedPaymentReport(tx, {
        report: paymentReport,
        method: "CASH",
        reviewerId: adminUser.id,
        cashAccountId: cashAccount.id,
        chargeIds: [charge.id],
      }),
    )
    ids.paymentId = payment.id

    const [confirmedReport, paidCharge, updatedCashAccount, cashTransactions] = await Promise.all([
      db.paymentReport.findUniqueOrThrow({ where: { id: paymentReport.id } }),
      db.charge.findUniqueOrThrow({ where: { id: charge.id } }),
      db.cashAccount.findUniqueOrThrow({ where: { id: cashAccount.id } }),
      db.cashTransaction.findMany({ where: { paymentId: payment.id } }),
    ])

    if (confirmedReport.status !== "CONFIRMED") throw new Error("Payment report was not confirmed")
    if (confirmedReport.paymentId !== payment.id) throw new Error("Payment report is not linked to payment")
    if (!confirmedReport.reviewedAt || confirmedReport.reviewedById !== adminUser.id) {
      throw new Error("Payment report review fields are not set")
    }
    if (!paidCharge.isPaid) throw new Error("Charge was not marked as paid")
    if (updatedCashAccount.balance !== amount) throw new Error("Cash account balance was not incremented")
    if (cashTransactions.length !== 1 || cashTransactions[0].amount !== amount) {
      throw new Error("Cash transaction was not created correctly")
    }

    console.log("[e2e-critical-payment] passed")
  } finally {
    await db.paymentReport.deleteMany({ where: { id: ids.paymentReportId } })
    await db.cashTransaction.deleteMany({ where: { paymentId: ids.paymentId } })
    await db.payment.deleteMany({ where: { id: ids.paymentId } })
    await db.charge.deleteMany({ where: { id: ids.chargeId } })
    await db.cashAccount.deleteMany({ where: { id: ids.cashAccountId } })
    await db.tenantSpace.deleteMany({ where: { tenantId: ids.tenantId } })
    await db.tenant.deleteMany({ where: { id: ids.tenantId } })
    await db.space.deleteMany({ where: { id: ids.spaceId } })
    await db.floor.deleteMany({ where: { id: ids.floorId } })
    await db.userBuildingAccess.deleteMany({ where: { id: ids.buildingAccessId } })
    await db.building.deleteMany({ where: { id: ids.buildingId } })
    await db.user.deleteMany({ where: { id: { in: [ids.adminUserId, ids.tenantUserId].filter(Boolean) as string[] } } })
    await db.organization.deleteMany({ where: { id: ids.organizationId } })
    await db.$disconnect()
    await pool.end()
  }
}

main().catch((error) => {
  console.error("[e2e-critical-payment] failed")
  console.error(error)
  process.exit(1)
})
