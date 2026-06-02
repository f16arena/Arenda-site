export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { requireOrgAccess } from "@/lib/org"
import { contractScope } from "@/lib/tenant-scope"
import { getCurrentBuildingId } from "@/lib/current-building"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { DocumentsBrowser } from "./documents-browser"
import { DocumentsHub } from "@/components/documents/documents-hub"
import { DocumentCreate } from "@/components/documents/document-create"
import type { DocRow } from "./documents-table"
import { safeServerValue } from "@/lib/server-fallback"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"

// Грузим расширенный набор — фильтрация/поиск/пагинация делаются на клиенте.
const DOCUMENT_SOURCE_LIMIT = 200

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; period?: string; page?: string | string[]; create?: string; tenantId?: string }>
}) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin/documents", orgId, userId: session.user.id })
  const currentBuildingId = await getCurrentBuildingId()
  if (currentBuildingId) await assertBuildingInOrg(currentBuildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const visibleBuildingIds = currentBuildingId ? [currentBuildingId] : accessibleBuildingIds
  const allowedCapabilities = new Set(await getAllowedCapabilityKeysForUser({
    userId: session.user.id,
    role: session.user.role,
    isPlatformOwner: session.user.isPlatformOwner,
    orgId,
  }))
  const isOwnerLikeUser = session.user.role === "OWNER" || !!session.user.isPlatformOwner
  const canCreateDocuments = allowedCapabilities.has("documents.create")
  const canDeleteUnsignedDocuments = allowedCapabilities.has("documents.deleteUnsigned")
  const canDeleteSignedDocuments = isOwnerLikeUser && allowedCapabilities.has("documents.deleteSigned")

  const { type, q, period, create, tenantId: createTenantId } = await searchParams
  const CREATE_TABS = ["contract", "addendum", "avr", "invoice", "reconciliation"] as const
  const createTab = (CREATE_TABS as readonly string[]).includes(create ?? "")
    ? (create as (typeof CREATE_TABS)[number])
    : "contract"
  const wantsCreate = !!create
  const tenantWhere = {
    OR: [
      { space: { floor: { buildingId: { in: visibleBuildingIds } } } },
      { tenantSpaces: { some: { space: { floor: { buildingId: { in: visibleBuildingIds } } } } } },
      { fullFloors: { some: { buildingId: { in: visibleBuildingIds } } } },
    ],
  }

  // GeneratedDocument НЕ имеет relation `tenant` (только скаляр tenantId), поэтому
  // фильтровать через `tenant: {...}` нельзя — это валило страницу (Prisma
  // validation error). Резолвим id арендаторов видимых зданий и фильтруем по tenantId.
  const visibleTenantIds = (await safe(
    "admin.documents.visibleTenantIds",
    db.tenant.findMany({
      where: { user: { organizationId: orgId }, ...tenantWhere },
      select: { id: true },
    }),
    [] as Array<{ id: string }>,
  )).map((t) => t.id)

  const generatedTenantFilter = currentBuildingId
    ? { tenantId: { in: visibleTenantIds } }
    : {
        OR: [
          { tenantId: { in: visibleTenantIds } },
          { tenantId: null },
        ],
      }

  const [contracts, generated] = await Promise.all([
    safe(
      "admin.documents.contracts",
      db.contract.findMany({
        where: { AND: [contractScope(orgId), { tenant: tenantWhere }] },
        select: {
          id: true,
          number: true,
          type: true,
          status: true,
          signedAt: true,
          signedByTenantAt: true,
          signedByLandlordAt: true,
          startDate: true,
          endDate: true,
          createdAt: true,
          attachmentFileId: true,
          builderState: true,
          tenant: { select: { id: true, companyName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: DOCUMENT_SOURCE_LIMIT,
      }),
      [] as Array<{
        id: string
        number: string
        type: string
        status: string
        signedAt: Date | null
        signedByTenantAt: Date | null
        signedByLandlordAt: Date | null
        startDate: Date | null
        endDate: Date | null
        createdAt: Date
        attachmentFileId: string | null
        builderState: unknown
        tenant: { id: string; companyName: string }
      }>,
    ),
    safe(
      "admin.documents.generated",
      db.generatedDocument.findMany({
        where: {
          organizationId: orgId,
          ...(visibleBuildingIds.length > 0 ? generatedTenantFilter : { id: "__never__" }),
        },
        orderBy: { generatedAt: "desc" },
        take: DOCUMENT_SOURCE_LIMIT,
      }),
      [],
    ),
  ])

  const signatureTargets = [
    ...contracts.flatMap((contract) => [
      { documentType: "CONTRACT", documentId: contract.id },
      ...(contract.number ? [{ documentType: "CONTRACT", documentRef: contract.number }] : []),
    ]),
    ...generated.flatMap((doc) => [
      { documentType: doc.documentType, documentId: doc.id },
      ...(doc.number ? [{ documentType: doc.documentType, documentRef: doc.number }] : []),
    ]),
  ]

  const signatures = signatureTargets.length > 0
    ? await safe(
        "admin.documents.signatures",
        db.documentSignature.findMany({
          where: {
            organizationId: orgId,
            OR: signatureTargets,
          },
          select: { documentType: true, documentId: true, documentRef: true },
        }),
        [] as Array<{ documentType: string; documentId: string | null; documentRef: string | null }>,
      )
    : []

  const signedById = new Set(
    signatures
      .filter((signature) => signature.documentId)
      .map((signature) => `${signature.documentType}:${signature.documentId}`)
  )
  const signedByRef = new Set(
    signatures
      .filter((signature) => signature.documentRef)
      .map((signature) => `${signature.documentType}:${signature.documentRef}`)
  )

  const contractRows: DocRow[] = contracts.map((c) => {
    const isSigned = (
      signedById.has(`CONTRACT:${c.id}`)
      || signedByRef.has(`CONTRACT:${c.number}`)
      || c.status === "SIGNED"
      || c.status === "SIGNED_BY_TENANT"
      || !!c.signedAt
      || !!c.signedByTenantAt
      || !!c.signedByLandlordAt
    )

    const category: DocRow["category"] =
      c.status === "DRAFT" ? "draft"
      : c.status === "SENT" || c.status === "VIEWED" || c.status === "SIGNED_BY_TENANT" ? "signing"
      : c.status === "ARCHIVED" || c.status === "REJECTED" ? "archive"
      : c.status === "SIGNED" ? "active"
      : isSigned ? "active" : "signing"

    return {
      id: `c-${c.id}`,
      type: "CONTRACT",
      number: c.number,
      tenantName: c.tenant.companyName,
      tenantId: c.tenant.id,
      // У договора «Период» = срок аренды, «Сумма» = месячная аренда (из конструктора).
      period: c.startDate
        ? `${c.startDate.toLocaleDateString("ru-RU")} – ${c.endDate ? c.endDate.toLocaleDateString("ru-RU") : "…"}`
        : null,
      totalAmount: (() => {
        const bs = c.builderState as { financials?: { monthlyRent?: number } } | null
        const rent = bs?.financials?.monthlyRent
        return typeof rent === "number" && rent > 0 ? rent : null
      })(),
      generatedAt: c.createdAt,
      source: "contract",
      // Внешний договор — отдаём приложенный PDF напрямую; у обычных — карточка договора.
      downloadHref: c.type === "EXTERNAL" && c.attachmentFileId ? `/api/storage/${c.attachmentFileId}` : null,
      viewHref: c.type === "EXTERNAL" ? null : `/admin/contracts/${c.id}`,
      category,
      deleteId: c.id,
      canDelete: isSigned ? canDeleteSignedDocuments : canDeleteUnsignedDocuments,
      isSigned,
    }
  })

  // Статус оплаты счетов — по начислениям за (арендатор × период).
  const invoiceKeys = generated
    .filter((g) => g.documentType === "INVOICE" && g.tenantId && g.period && /^\d{4}-\d{2}$/.test(g.period))
    .map((g) => ({ tenantId: g.tenantId as string, period: g.period as string }))
  const paidStatusByKey = new Map<string, "paid" | "debt">()
  if (invoiceKeys.length > 0) {
    const tenantIds = [...new Set(invoiceKeys.map((k) => k.tenantId))]
    const periods = [...new Set(invoiceKeys.map((k) => k.period))]
    const charges = await safe(
      "admin.documents.invoiceCharges",
      db.charge.findMany({
        where: { tenantId: { in: tenantIds }, period: { in: periods } },
        select: { tenantId: true, period: true, isPaid: true },
      }),
      [] as Array<{ tenantId: string; period: string; isPaid: boolean }>,
    )
    const agg = new Map<string, { any: boolean; unpaid: boolean }>()
    for (const c of charges) {
      const key = `${c.tenantId}|${c.period}`
      const a = agg.get(key) ?? { any: false, unpaid: false }
      a.any = true
      if (!c.isPaid) a.unpaid = true
      agg.set(key, a)
    }
    for (const [key, a] of agg) {
      if (a.any) paidStatusByKey.set(key, a.unpaid ? "debt" : "paid")
    }
  }

  const generatedRows: DocRow[] = generated.map((g) => {
    const isSigned = (
      signedById.has(`${g.documentType}:${g.id}`)
      || (g.number ? signedByRef.has(`${g.documentType}:${g.number}`) : false)
    )

    return {
      id: `g-${g.id}`,
      type: g.documentType,
      number: g.number,
      tenantName: g.tenantName,
      tenantId: g.tenantId,
      period: g.period,
      totalAmount: g.totalAmount,
      generatedAt: g.generatedAt,
      source: "generated",
      // Скачивание счёта/АВР/акта — в PDF (конвертация DOCX→PDF на VPS, fallback DOCX).
      downloadHref: `/api/documents/archive/${g.id}?format=pdf`,
      viewHref: null,
      category: "active" as const,
      generatedId: g.id,
      deleteId: g.id,
      canDelete: isSigned ? canDeleteSignedDocuments : canDeleteUnsignedDocuments,
      isSigned,
      paymentStatus: g.documentType === "INVOICE" && g.tenantId && g.period
        ? (paidStatusByKey.get(`${g.tenantId}|${g.period}`) ?? "none")
        : null,
    }
  })

  const allRows: DocRow[] = [...contractRows, ...generatedRows].sort(
    (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Документы</h1>
      </div>

      <DocumentsHub
        canCreate={canCreateDocuments}
        initialTab={wantsCreate ? "create" : "archive"}
        archive={
          <DocumentsBrowser
            rows={allRows}
            initialType={(type ?? "ALL").toUpperCase()}
            initialSearch={q?.trim() ?? ""}
            initialPeriod={period ?? ""}
          />
        }
        create={canCreateDocuments ? <DocumentCreate key={currentBuildingId ?? "all"} initialTab={createTab} initialTenantId={createTenantId} /> : null}
      />
    </div>
  )
}
