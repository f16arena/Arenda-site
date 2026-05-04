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
import type { ElementType } from "react"
import {
  ClipboardCheck,
  FileCheck,
  FileText,
  Plus,
  Receipt,
  Settings,
} from "lucide-react"
import { DocumentTypeFilter } from "./document-type-filter"
import { DocumentsTableLoader } from "./documents-table-loader"
import type { DocRow } from "./documents-table"

type DocType = "ALL" | "CONTRACT" | "INVOICE" | "ACT" | "RECONCILIATION" | "HANDOVER"

const DOCUMENT_SOURCE_LIMIT = 80

const TYPE_LABELS: Record<string, string> = {
  CONTRACT: "Договор",
  INVOICE: "Счёт на оплату",
  ACT: "АВР",
  RECONCILIATION: "Акт сверки",
  HANDOVER: "Акт приёма-передачи",
}

const CREATE_TYPES: {
  label: string
  href: string
  icon: ElementType
  color: string
}[] = [
  {
    label: "Договор",
    href: "/admin/documents/new/contract",
    icon: FileCheck,
    color: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    label: "Счёт на оплату",
    href: "/admin/documents/new/invoice",
    icon: Receipt,
    color: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    label: "АВР",
    href: "/admin/documents/new/act",
    icon: ClipboardCheck,
    color: "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  {
    label: "Акт сверки",
    href: "/admin/documents/new/reconciliation",
    icon: FileText,
    color: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
]

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
  const canDeleteSignedDocuments = session.user.role === "OWNER" || !!session.user.isPlatformOwner

  const { type, q, period } = await searchParams
  const filterType = (type ?? "ALL").toUpperCase() as DocType
  const search = q?.trim() ?? ""
  const tenantWhere = {
    OR: [
      { space: { floor: { buildingId: { in: visibleBuildingIds } } } },
      { tenantSpaces: { some: { space: { floor: { buildingId: { in: visibleBuildingIds } } } } } },
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
            status: true,
            signedAt: true,
            signedByTenantAt: true,
            signedByLandlordAt: true,
            startDate: true,
            endDate: true,
            createdAt: true,
            tenant: { select: { id: true, companyName: true } },
          },
          orderBy: { createdAt: "desc" },
          take: DOCUMENT_SOURCE_LIMIT,
        }).catch(() => [] as Array<{
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
          take: DOCUMENT_SOURCE_LIMIT,
        }).catch(() => [])
      : [],
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
    ? await db.documentSignature.findMany({
        where: {
          organizationId: orgId,
          OR: signatureTargets,
        },
        select: { documentType: true, documentId: true, documentRef: true },
      }).catch(() => [] as Array<{ documentType: string; documentId: string | null; documentRef: string | null }>)
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

    return {
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
      deleteId: c.id,
      canDelete: !isSigned || canDeleteSignedDocuments,
      isSigned,
    }
  })

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
      downloadHref: `/api/documents/archive/${g.id}`,
      generatedId: g.id,
      deleteId: g.id,
      canDelete: !isSigned || canDeleteSignedDocuments,
      isSigned,
    }
  })

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
    : "Документы ещё не созданы. Нажмите «Создать документ» и выберите тип."

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Документы</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {allRows.length} {allRows.length === 1 ? "документ" : "документов"}
            {filterType !== "ALL" ? ` · тип «${TYPE_LABELS[filterType] ?? filterType}»` : ""}
            {period ? ` · период ${period}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/settings/document-templates"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          >
            <Settings className="h-4 w-4" />
            Шаблоны
          </Link>
          <Link
            href="/admin/documents/new"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Создать документ
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CREATE_TYPES.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 hover:border-blue-300 dark:hover:border-blue-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/40"
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.color}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.label}</span>
            </Link>
          )
        })}
      </div>

      <DocumentTypeFilter currentType={filterType} currentSearch={search} currentPeriod={period} />

      <DocumentsTableLoader rows={allRows} emptyHint={emptyHint} />
    </div>
  )
}
