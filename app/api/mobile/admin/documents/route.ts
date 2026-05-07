import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileStaffRequest, tenantInBuildingsWhere } from "@/lib/mobile-admin"

export const dynamic = "force-dynamic"

const DOCUMENT_TYPES = ["INVOICE", "ACT", "RECONCILIATION"]
const CONTRACT_PENDING_STATUSES = ["SENT", "VIEWED", "SIGNED_BY_TENANT"]
const DEFAULT_LIMIT = 30
const MAX_LIMIT = 60

export async function GET(req: Request) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const { ctx, buildingIds } = result
  const origin = new URL(req.url).origin
  const url = new URL(req.url)
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80)
  const tenantId = (url.searchParams.get("tenantId") ?? "").trim() || null
  const category = normalizeCategory(url.searchParams.get("category"))
  const limit = clampNumber(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT)
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0)
  const perListLimit = category === "ALL" ? Math.ceil(limit / 2) : limit
  const tenantScope = {
    user: { organizationId: ctx.org.id },
    ...tenantInBuildingsWhere(buildingIds),
    ...(tenantId ? { id: tenantId } : {}),
  }

  const hasRestrictedBuildingScope = ctx.user.role !== "OWNER"
  const needsGeneratedTenantScope = category !== "CONTRACT" && (hasRestrictedBuildingScope || tenantId)
  const scopedTenantIds = needsGeneratedTenantScope
    ? await db.tenant.findMany({
        where: tenantScope,
        select: { id: true },
      })
    : null
  const generatedTenantScope = scopedTenantIds
    ? { tenantId: { in: scopedTenantIds.length > 0 ? scopedTenantIds.map((tenant) => tenant.id) : ["__none__"] } }
    : {}
  const contractSearch = q
    ? {
        OR: [
          { number: { contains: q, mode: "insensitive" as const } },
          { status: { contains: q, mode: "insensitive" as const } },
          { tenant: { companyName: { contains: q, mode: "insensitive" as const } } },
        ],
      }
    : {}
  const generatedSearch = q
    ? {
        OR: [
          { tenantName: { contains: q, mode: "insensitive" as const } },
          { fileName: { contains: q, mode: "insensitive" as const } },
          { number: { contains: q, mode: "insensitive" as const } },
          { period: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {}
  const contractWhere = {
    tenant: tenantScope,
    ...contractSearch,
  }
  const generatedBaseWhere = {
    organizationId: ctx.org.id,
    ...generatedTenantScope,
    documentType: { in: DOCUMENT_TYPES },
    ...generatedSearch,
  }
  const generatedPageWhere = {
    ...generatedBaseWhere,
    ...(category !== "ALL" && category !== "CONTRACT" ? { documentType: category } : {}),
  }
  const shouldFetchContracts = category === "ALL" || category === "CONTRACT"
  const shouldFetchGenerated = category === "ALL" || DOCUMENT_TYPES.includes(category)

  const [
    totalContracts,
    generatedCounts,
    pendingContracts,
    contracts,
    generated,
  ] = await Promise.all([
    db.contract.count({ where: contractWhere }),
    db.generatedDocument.groupBy({
      by: ["documentType"],
      where: generatedBaseWhere,
      _count: { _all: true },
    }),
    db.contract.count({
      where: {
        ...contractWhere,
        status: { in: CONTRACT_PENDING_STATUSES },
      },
    }),
    shouldFetchContracts
      ? db.contract.findMany({
          where: contractWhere,
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
          skip: offset,
          take: perListLimit,
        })
      : Promise.resolve([]),
    shouldFetchGenerated
      ? db.generatedDocument.findMany({
          where: generatedPageWhere,
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
          skip: offset,
          take: perListLimit,
        })
      : Promise.resolve([]),
  ])
  const generatedTenantIds = Array.from(
    new Set(generated.map((document) => document.tenantId).filter((id): id is string => Boolean(id))),
  )
  const generatedTenantNames = generatedTenantIds.length > 0
    ? await db.tenant.findMany({
        where: { id: { in: generatedTenantIds }, user: { organizationId: ctx.org.id } },
        select: { id: true, companyName: true },
      })
    : []
  const tenantNames = new Map(generatedTenantNames.map((tenant) => [tenant.id, tenant.companyName]))

  const generatedByType = new Map(generatedCounts.map((row) => [row.documentType, row._count._all]))
  const totalGenerated = [...generatedByType.values()].reduce((sum, count) => sum + count, 0)
  const totalForPage =
    category === "CONTRACT" ? totalContracts :
    category === "ALL" ? totalContracts + totalGenerated :
    generatedByType.get(category) ?? 0

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
  const hasMore =
    category === "ALL"
      ? offset + contractItems.length < totalContracts || offset + generatedItems.length < totalGenerated
      : offset + contractItems.length + generatedItems.length < totalForPage

  return NextResponse.json({
    counters: {
      total: totalContracts + totalGenerated,
      contracts: totalContracts,
      invoices: generatedByType.get("INVOICE") ?? 0,
      acts: generatedByType.get("ACT") ?? 0,
      reconciliations: generatedByType.get("RECONCILIATION") ?? 0,
      pendingSignatures: pendingContracts,
    },
    contracts: contractItems,
    generated: generatedItems,
    pageInfo: {
      limit,
      offset,
      nextOffset: hasMore ? offset + perListLimit : null,
      hasMore,
    },
  })
}

function normalizeCategory(raw: string | null) {
  const category = (raw ?? "ALL").trim().toUpperCase()
  if (category === "CONTRACT" || category === "ALL" || DOCUMENT_TYPES.includes(category)) return category
  return "ALL"
}

function clampNumber(raw: string | null, fallback: number, max: number) {
  const value = Number(raw ?? fallback)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.min(Math.floor(value), max)
}
