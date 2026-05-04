export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { requireOrgAccess } from "@/lib/org"
import { contractScope } from "@/lib/tenant-scope"
import { getCurrentBuildingId } from "@/lib/current-building"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import Link from "next/link"
import { DocumentTypeFilter } from "./document-type-filter"
import { DocumentsTableLoader } from "./documents-table-loader"
import type { DocRow } from "./documents-table"

type DocType = "ALL" | "CONTRACT" | "INVOICE" | "ACT" | "RECONCILIATION" | "HANDOVER"

const TYPE_LABELS: Record<string, string> = {
  CONTRACT: "Договор",
  INVOICE: "Счёт на оплату",
  ACT: "Акт оказанных услуг",
  RECONCILIATION: "Акт сверки",
  HANDOVER: "Акт приёма-передачи",
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; period?: string }>
}) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()
  const currentBuildingId = await getCurrentBuildingId()
  if (currentBuildingId) await assertBuildingInOrg(currentBuildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const visibleBuildingIds = currentBuildingId ? [currentBuildingId] : accessibleBuildingIds

  const { type, q, period } = await searchParams
  const filterType = (type ?? "ALL").toUpperCase() as DocType
  const search = q?.trim() ?? ""
  const tenantWhere = {
    OR: [
      { space: { floor: { buildingId: { in: visibleBuildingIds } } } },
      { fullFloors: { some: { buildingId: { in: visibleBuildingIds } } } },
    ],
  }
  const visibleTenantIds = visibleBuildingIds.length > 0
    ? await db.tenant.findMany({
        where: tenantWhere,
        select: { id: true },
      }).then((rows) => rows.map((t) => t.id)).catch(() => [] as string[])
    : []

  const [contracts, generated] = await Promise.all([
    filterType === "ALL" || filterType === "CONTRACT"
      ? db.contract.findMany({
          where: { AND: [contractScope(orgId), { tenant: tenantWhere }] },
          select: {
            id: true,
            number: true,
            type: true,
            startDate: true,
            endDate: true,
            createdAt: true,
            tenant: { select: { id: true, companyName: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 200,
        }).catch(() => [] as Array<{
          id: string
          number: string
          type: string
          startDate: Date | null
          endDate: Date | null
          createdAt: Date
          tenant: { id: string; companyName: string }
        }>)
      : [],
    filterType === "ALL" || filterType !== "CONTRACT"
      ? db.generatedDocument.findMany({
          where: {
            organizationId: orgId,
            ...(currentBuildingId
              ? { tenantId: { in: visibleTenantIds } }
              : {
                  OR: [
                    { tenantId: { in: visibleTenantIds } },
                    { tenantId: null },
                  ],
                }),
            ...(filterType !== "ALL" ? { documentType: filterType } : {}),
            ...(period ? { period } : {}),
          },
          orderBy: { generatedAt: "desc" },
          take: 200,
        }).catch(() => [])
      : [],
  ])

  const contractRows: DocRow[] = contracts.map((c) => ({
    id: `c-${c.id}`,
    type: "CONTRACT",
    number: c.number,
    tenantName: c.tenant.companyName,
    tenantId: c.tenant.id,
    period: null,
    totalAmount: null,
    generatedAt: c.createdAt,
    source: "contract",
    downloadHref: null,
  }))

  const generatedRows: DocRow[] = generated.map((g) => ({
    id: `g-${g.id}`,
    type: g.documentType,
    number: g.number,
    tenantName: g.tenantName,
    tenantId: g.tenantId,
    period: g.period,
    totalAmount: g.totalAmount,
    generatedAt: g.generatedAt,
    source: "generated",
    downloadHref: `/api/documents/archive/${g.id}`,
    generatedId: g.id,
  }))

  let allRows = [...contractRows, ...generatedRows].sort(
    (a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
  )

  if (search) {
    const lower = search.toLowerCase()
    allRows = allRows.filter(
      (r) =>
        r.tenantName.toLowerCase().includes(lower) ||
        r.number?.toLowerCase().includes(lower)
    )
  }

  const emptyHint = search || period || filterType !== "ALL"
    ? "По вашим фильтрам ничего не найдено"
    : "Документы ещё не созданы. Сгенерируйте счёт или акт через кнопки выше."

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Документы</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">
            {allRows.length} {allRows.length === 1 ? "документ" : "документов"}
            {filterType !== "ALL" ? ` · тип «${TYPE_LABELS[filterType] ?? filterType}»` : ""}
            {period ? ` · период ${period}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/documents/templates/invoice"
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50"
          >
            + Счёт
          </Link>
          <Link
            href="/admin/documents/templates/act"
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50"
          >
            + Акт услуг
          </Link>
          <Link
            href="/admin/documents/templates/reconciliation"
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50"
          >
            + Акт сверки
          </Link>
        </div>
      </div>

      <DocumentTypeFilter currentType={filterType} currentSearch={search} currentPeriod={period} />

      <DocumentsTableLoader rows={allRows} emptyHint={emptyHint} />
    </div>
  )
}
