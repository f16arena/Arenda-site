import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileStaffRequest, requestInBuildingsWhere, paymentReportInBuildingsWhere, tenantInBuildingsWhere } from "@/lib/mobile-admin"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const { ctx, buildings, buildingIds } = result
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  const [
    openRequests,
    todayRequests,
    urgentRequests,
    pendingPayments,
    overdueDebt,
    activeTasks,
    signatureRequests,
    activeNotices,
    recentRequests,
    recentPayments,
  ] = await Promise.all([
    db.request.count({
      where: {
        status: { notIn: ["DONE", "CLOSED", "CANCELLED"] },
        ...requestInBuildingsWhere(buildingIds),
      },
    }),
    db.request.count({
      where: {
        createdAt: { gte: todayStart },
        ...requestInBuildingsWhere(buildingIds),
      },
    }),
    db.request.count({
      where: {
        priority: { in: ["HIGH", "URGENT"] },
        status: { notIn: ["DONE", "CLOSED", "CANCELLED"] },
        ...requestInBuildingsWhere(buildingIds),
      },
    }),
    db.paymentReport.aggregate({
      where: {
        status: { in: ["PENDING", "DISPUTED"] },
        ...paymentReportInBuildingsWhere(buildingIds),
      },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    db.charge.aggregate({
      where: {
        isPaid: false,
        dueDate: { lt: now },
        tenant: tenantInBuildingsWhere(buildingIds),
      },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    db.task.count({
      where: {
        buildingId: { in: buildingIds.length > 0 ? buildingIds : ["__none__"] },
        status: { notIn: ["DONE", "CLOSED", "CANCELLED"] },
      },
    }),
    db.documentSignatureRequest.count({
      where: {
        organizationId: ctx.org.id,
        status: { in: ["PENDING", "VIEWED"] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    }),
    db.buildingNotice.count({
      where: {
        organizationId: ctx.org.id,
        buildingId: { in: buildingIds.length > 0 ? buildingIds : ["__none__"] },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
    }),
    db.request.findMany({
      where: requestInBuildingsWhere(buildingIds),
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        type: true,
        createdAt: true,
        tenant: { select: { id: true, companyName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    db.paymentReport.findMany({
      where: {
        status: { in: ["PENDING", "DISPUTED"] },
        ...paymentReportInBuildingsWhere(buildingIds),
      },
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        method: true,
        status: true,
        receiptName: true,
        createdAt: true,
        tenant: { select: { id: true, companyName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ])

  return NextResponse.json({
    buildings,
    counters: {
      openRequests,
      todayRequests,
      urgentRequests,
      activeTasks,
      activeNotices,
      pendingSignatures: signatureRequests,
      pendingPayments: pendingPayments._count._all,
      pendingPaymentsAmount: pendingPayments._sum.amount ?? 0,
      overdueCharges: overdueDebt._count._all,
      overdueAmount: overdueDebt._sum.amount ?? 0,
    },
    recent: {
      requests: recentRequests,
      paymentReports: recentPayments,
    },
  })
}
