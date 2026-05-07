import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  currentPeriod,
  getMobilePaymentPurpose,
  getMobileTenantRequest,
  getMobileTenantScope,
  getMobileTenantSummary,
} from "@/lib/mobile-tenant"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const result = await getMobileTenantRequest(req)
  if (!result.ok) return result.response

  const { ctx, tenant } = result
  const scope = await getMobileTenantScope(tenant)
  const now = new Date()
  const period = currentPeriod()
  const origin = new URL(req.url).origin

  const [
    totalDebt,
    overdueDebt,
    nextCharge,
    pendingPaymentReports,
    activeRequests,
    unreadMessages,
    metersCount,
    signatureRequests,
    contractsToSign,
    recentDocuments,
    recentTenantDocuments,
    activeNotices,
  ] = await Promise.all([
    db.charge.aggregate({
      where: { tenantId: tenant.id, isPaid: false },
      _sum: { amount: true },
    }),
    db.charge.aggregate({
      where: { tenantId: tenant.id, isPaid: false, dueDate: { lt: now } },
      _sum: { amount: true },
    }),
    db.charge.findFirst({
      where: { tenantId: tenant.id, isPaid: false },
      select: { id: true, period: true, type: true, amount: true, dueDate: true, description: true },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    }),
    db.paymentReport.aggregate({
      where: { tenantId: tenant.id, status: { in: ["PENDING", "DISPUTED"] } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    db.request.count({
      where: { tenantId: tenant.id, status: { notIn: ["DONE", "CLOSED", "CANCELLED"] } },
    }),
    db.message.count({ where: { toId: ctx.user.id, isRead: false } }),
    scope.spaceIds.length > 0
      ? db.meter.count({ where: { spaceId: { in: scope.spaceIds } } })
      : Promise.resolve(0),
    db.documentSignatureRequest.findMany({
      where: {
        recipientUserId: ctx.user.id,
        organizationId: ctx.org.id,
        status: { in: ["PENDING", "VIEWED"] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        documentType: true,
        documentId: true,
        documentRef: true,
        title: true,
        message: true,
        status: true,
        allowedMethods: true,
        preferredMethod: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.contract.findMany({
      where: {
        tenantId: tenant.id,
        signToken: { not: null },
        status: { in: ["SENT", "VIEWED", "SIGNED_BY_TENANT"] },
      },
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        signToken: true,
        sentAt: true,
      },
      orderBy: { sentAt: "desc" },
      take: 5,
    }),
    db.generatedDocument.findMany({
      where: { tenantId: tenant.id, organizationId: ctx.org.id },
      select: {
        id: true,
        documentType: true,
        number: true,
        period: true,
        totalAmount: true,
        fileName: true,
        fileSize: true,
        format: true,
        generatedAt: true,
      },
      orderBy: { generatedAt: "desc" },
      take: 5,
    }),
    db.tenantDocument.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        type: true,
        name: true,
        fileUrl: true,
        storageFileId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    scope.buildingIds.length > 0
      ? db.buildingNotice.findMany({
          where: {
            organizationId: ctx.org.id,
            buildingId: { in: scope.buildingIds },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
          select: {
            id: true,
            buildingId: true,
            type: true,
            severity: true,
            title: true,
            message: true,
            startsAt: true,
            endsAt: true,
            sentAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      : Promise.resolve([]),
  ])

  const generatedDocuments = recentDocuments.map((document) => ({
    ...document,
    downloadUrl: `${origin}/api/mobile/tenant/documents/generated/${document.id}`,
  }))
  const tenantDocuments = recentTenantDocuments.map((document) => ({
    ...document,
    downloadUrl: document.storageFileId
      ? `${origin}/api/mobile/tenant/documents/storage/${document.storageFileId}`
      : document.fileUrl,
  }))

  return NextResponse.json({
    tenant: getMobileTenantSummary(tenant),
    buildings: scope.buildings,
    finances: {
      currentPeriod: period,
      paymentPurpose: getMobilePaymentPurpose(tenant, period),
      totalDebt: totalDebt._sum.amount ?? 0,
      overdueDebt: overdueDebt._sum.amount ?? 0,
      nextCharge,
      pendingPaymentReports: {
        count: pendingPaymentReports._count._all,
        amount: pendingPaymentReports._sum.amount ?? 0,
      },
    },
    counters: {
      activeRequests,
      unreadMessages,
      meters: metersCount,
      pendingDocuments: signatureRequests.length + contractsToSign.length,
      activeBuildingNotices: activeNotices.length,
    },
    actionItems: {
      signatureRequests,
      contractLinks: contractsToSign.map((contract) => ({
        id: contract.id,
        documentType: "CONTRACT",
        documentRef: contract.number,
        title: `${contract.type === "ADDENDUM" ? "Доп. соглашение" : "Договор"} № ${contract.number}`,
        status: contract.status,
        webUrl: `${origin}/sign/${contract.signToken}`,
        createdAt: contract.sentAt,
      })),
    },
    documents: {
      generated: generatedDocuments,
      tenant: tenantDocuments,
    },
    notices: activeNotices,
  })
}
