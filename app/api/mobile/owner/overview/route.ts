import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileStaffRequest, tenantInBuildingsWhere } from "@/lib/mobile-admin"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const result = await getMobileStaffRequest(req, new Set(["OWNER"]))
  if (!result.ok) return result.response

  const { ctx, buildings, buildingIds } = result
  const tenantWhere = tenantInBuildingsWhere(buildingIds)
  const now = new Date()
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const [
    tenants,
    totalDebt,
    overdueDebt,
    paymentsMonth,
    openRequests,
    pendingPayments,
    expiringContracts,
    pendingSignatures,
    generatedDocs,
  ] = await Promise.all([
    db.tenant.count({ where: tenantWhere }),
    db.charge.aggregate({
      where: { isPaid: false, tenant: tenantWhere },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.charge.aggregate({
      where: { isPaid: false, dueDate: { lt: now }, tenant: tenantWhere },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.payment.aggregate({
      where: {
        paymentDate: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
        tenant: tenantWhere,
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.request.count({
      where: {
        tenant: tenantWhere,
        status: { notIn: ["DONE", "CLOSED", "CANCELLED"] },
      },
    }),
    db.paymentReport.aggregate({
      where: {
        status: { in: ["PENDING", "DISPUTED"] },
        tenant: tenantWhere,
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.contract.count({
      where: {
        tenant: tenantWhere,
        endDate: { gte: now, lte: thirtyDaysLater },
        status: { notIn: ["REJECTED", "EXPIRED"] },
      },
    }),
    db.documentSignatureRequest.count({
      where: {
        organizationId: ctx.org.id,
        status: { in: ["PENDING", "VIEWED"] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    }),
    db.generatedDocument.count({
      where: {
        organizationId: ctx.org.id,
        generatedAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) },
      },
    }),
  ])

  const buildingSummaries = await Promise.all(buildings.map(async (building) => {
    const buildingTenantWhere = tenantInBuildingsWhere([building.id])
    const [buildingTenants, buildingDebt, buildingRequests] = await Promise.all([
      db.tenant.count({ where: buildingTenantWhere }),
      db.charge.aggregate({
        where: { isPaid: false, tenant: buildingTenantWhere },
        _sum: { amount: true },
      }),
      db.request.count({
        where: {
          tenant: buildingTenantWhere,
          status: { notIn: ["DONE", "CLOSED", "CANCELLED"] },
        },
      }),
    ])
    return {
      ...building,
      tenants: buildingTenants,
      debtAmount: buildingDebt._sum.amount ?? 0,
      openRequests: buildingRequests,
    }
  }))

  return NextResponse.json({
    organization: ctx.org,
    counters: {
      buildings: buildings.length,
      tenants,
      totalDebt: totalDebt._sum.amount ?? 0,
      totalDebtCharges: totalDebt._count._all,
      overdueDebt: overdueDebt._sum.amount ?? 0,
      overdueCharges: overdueDebt._count._all,
      paymentsMonth: paymentsMonth._sum.amount ?? 0,
      paymentsMonthCount: paymentsMonth._count._all,
      openRequests,
      pendingPayments: pendingPayments._count._all,
      pendingPaymentsAmount: pendingPayments._sum.amount ?? 0,
      expiringContracts,
      pendingSignatures,
      generatedDocsMonth: generatedDocs,
    },
    buildings: buildingSummaries,
  })
}
