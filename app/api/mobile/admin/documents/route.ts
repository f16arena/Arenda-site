import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileStaffRequest, tenantInBuildingsWhere } from "@/lib/mobile-admin"

export const dynamic = "force-dynamic"

const DOCUMENT_TYPES = ["INVOICE", "ACT", "RECONCILIATION"]
const CONTRACT_PENDING_STATUSES = ["SENT", "VIEWED", "SIGNED_BY_TENANT"]

export async function GET(req: Request) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const { ctx, buildingIds } = result
  const origin = new URL(req.url).origin

  const tenants = await db.tenant.findMany({
    where: {
      user: { organizationId: ctx.org.id },
      ...tenantInBuildingsWhere(buildingIds),
    },
    select: { id: true, companyName: true },
    orderBy: { companyName: "asc" },
    take: 100,
  })
  const tenantIds = tenants.map((tenant) => tenant.id)
  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.companyName]))

  const [contracts, generated] = await Promise.all([
    db.contract.findMany({
      where: {
        tenantId: { in: tenantIds.length > 0 ? tenantIds : ["__none__"] },
      },
      select: {
        id: true,
        tenantId: true,
        number: true,
        type: true,
        status: true,
        startDate: true,
        endDate: true,
        signedAt: true,
        sentAt: true,
        signToken: true,
        tenant: { select: { companyName: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 120,
    }),
    db.generatedDocument.findMany({
      where: {
        organizationId: ctx.org.id,
        documentType: { in: DOCUMENT_TYPES },
        tenantId: { in: tenantIds.length > 0 ? tenantIds : ["__none__"] },
      },
      select: {
        id: true,
        tenantId: true,
        tenantName: true,
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
      take: 120,
    }),
  ])

  const contractItems = contracts.map((contract) => ({
    id: contract.id,
    tenantId: contract.tenantId,
    tenantName: contract.tenant.companyName,
    number: contract.number,
    type: contract.type,
    status: contract.status,
    startDate: contract.startDate,
    endDate: contract.endDate,
    signedAt: contract.signedAt,
    sentAt: contract.sentAt,
    webUrl: contract.signToken ? `${origin}/sign/${contract.signToken}` : `${origin}/admin/contracts`,
  }))

  const generatedItems = generated.map((document) => ({
    ...document,
    tenantName: tenantNames.get(document.tenantId ?? "") ?? document.tenantName,
    downloadUrl: `${origin}/api/mobile/admin/documents/generated/${document.id}`,
  }))

  return NextResponse.json({
    counters: {
      total: contractItems.length + generatedItems.length,
      contracts: contractItems.length,
      invoices: generatedItems.filter((document) => document.documentType === "INVOICE").length,
      acts: generatedItems.filter((document) => document.documentType === "ACT").length,
      reconciliations: generatedItems.filter((document) => document.documentType === "RECONCILIATION").length,
      pendingSignatures: contractItems.filter((contract) => CONTRACT_PENDING_STATUSES.includes(contract.status)).length,
    },
    contracts: contractItems,
    generated: generatedItems,
  })
}
