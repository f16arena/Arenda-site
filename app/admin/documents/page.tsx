export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { requireOrgAccess } from "@/lib/org"
import { contractScope } from "@/lib/tenant-scope"
import { formatMoney } from "@/lib/utils"
import { FileText, Download, Search, Filter as FilterIcon } from "lucide-react"
import Link from "next/link"
import { DocumentTypeFilter } from "./document-type-filter"

type DocType = "ALL" | "CONTRACT" | "INVOICE" | "ACT" | "RECONCILIATION" | "HANDOVER"

const TYPE_LABELS: Record<string, string> = {
  CONTRACT: "Договор",
  INVOICE: "Счёт на оплату",
  ACT: "Акт оказанных услуг",
  RECONCILIATION: "Акт сверки",
  HANDOVER: "Акт приёма-передачи",
}

const TYPE_COLORS: Record<string, string> = {
  CONTRACT: "bg-blue-50 text-blue-700",
  INVOICE: "bg-emerald-50 text-emerald-700",
  ACT: "bg-purple-50 text-purple-700",
  RECONCILIATION: "bg-amber-50 text-amber-700",
  HANDOVER: "bg-slate-100 text-slate-700",
}

interface DocRow {
  id: string
  type: string
  number: string | null
  tenantName: string
  tenantId: string | null
  period: string | null
  totalAmount: number | null
  generatedAt: Date
  source: "contract" | "generated"
  downloadHref: string | null
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; period?: string }>
}) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()

  const { type, q, period } = await searchParams
  const filterType = (type ?? "ALL").toUpperCase() as DocType
  const search = q?.trim() ?? ""

  const [contracts, generated] = await Promise.all([
    // Договоры (только если фильтр ALL или CONTRACT)
    filterType === "ALL" || filterType === "CONTRACT"
      ? db.contract.findMany({
          where: contractScope(orgId),
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
    // Сгенерированные документы (счета, акты, акты сверки)
    filterType === "ALL" || filterType !== "CONTRACT"
      ? db.generatedDocument.findMany({
          where: {
            organizationId: orgId,
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
  }))

  let allRows = [...contractRows, ...generatedRows].sort(
    (a, b) => b.generatedAt.getTime() - a.generatedAt.getTime()
  )

  // Текстовый поиск по контрагенту/номеру
  if (search) {
    const lower = search.toLowerCase()
    allRows = allRows.filter(
      (r) =>
        r.tenantName.toLowerCase().includes(lower) ||
        r.number?.toLowerCase().includes(lower)
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Документы</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {allRows.length} {allRows.length === 1 ? "документ" : "документов"}
            {filterType !== "ALL" ? ` · тип «${TYPE_LABELS[filterType] ?? filterType}»` : ""}
            {period ? ` · период ${period}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/documents/templates/invoice"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            + Счёт
          </Link>
          <Link
            href="/admin/documents/templates/act"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            + Акт услуг
          </Link>
          <Link
            href="/admin/documents/templates/reconciliation"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            + Акт сверки
          </Link>
        </div>
      </div>

      {/* Фильтры */}
      <DocumentTypeFilter currentType={filterType} currentSearch={search} currentPeriod={period} />

      {/* Таблица */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Тип</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Номер</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Контрагент</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Период</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Сумма</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Создан</th>
              <th className="px-5 py-3 text-right" />
            </tr>
          </thead>
          <tbody>
            {allRows.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                <td className="px-5 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[r.type] ?? "bg-slate-100 text-slate-700"}`}>
                    {TYPE_LABELS[r.type] ?? r.type}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono text-xs text-slate-700">{r.number ?? "—"}</td>
                <td className="px-5 py-3 text-slate-700">
                  {r.tenantId ? (
                    <Link href={`/admin/tenants/${r.tenantId}`} className="hover:text-blue-600 hover:underline">
                      {r.tenantName}
                    </Link>
                  ) : (
                    r.tenantName
                  )}
                </td>
                <td className="px-5 py-3 text-slate-600">{r.period ?? "—"}</td>
                <td className="px-5 py-3 text-right text-slate-700 font-medium">
                  {r.totalAmount != null ? formatMoney(r.totalAmount) : "—"}
                </td>
                <td className="px-5 py-3 text-xs text-slate-500">
                  {new Date(r.generatedAt).toLocaleDateString("ru-RU")}
                </td>
                <td className="px-5 py-3 text-right">
                  {r.downloadHref ? (
                    <a
                      href={r.downloadHref}
                      download
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 hover:bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700"
                    >
                      <Download className="h-3 w-3" />
                      Скачать
                    </a>
                  ) : (
                    <Link
                      href={`/admin/tenants/${r.tenantId}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Открыть →
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {allRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-16 text-center">
                  <FileText className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">
                    {search || period || filterType !== "ALL"
                      ? "По вашим фильтрам ничего не найдено"
                      : "Документы ещё не созданы"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Сгенерируйте счёт или акт через кнопки выше
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
