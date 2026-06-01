import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { formatMoney } from "@/lib/utils"
import { TenantSelector, PrintButton } from "../tenant-selector"
import { suggestDocumentNumber } from "@/lib/document-numbering"
import { requireOrgAccess } from "@/lib/org"
import { tenantScope } from "@/lib/tenant-scope"
import { getDocumentTenantOptions, getVisibleBuildingIds } from "@/lib/document-tenants"
import { DocumentArchive } from "@/components/documents/document-archive"
import { ReconciliationPeriodSelect } from "./period-select"
import { SendToTenantButton } from "@/components/documents/send-to-tenant-button"
import { resolveMonthRange } from "@/lib/period-range"
import { Download } from "lucide-react"

const CHARGE_TYPES: Record<string, string> = {
  RENT: "Аренда", ELECTRICITY: "Электричество", WATER: "Вода",
  HEATING: "Отопление", GARBAGE: "Вывоз мусора", SECURITY: "Охрана",
  INTERNET: "Интернет", GAS: "Газ", CLEANING: "Уборка", PENALTY: "Пеня", OTHER: "Прочее",
}

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string; from?: string; to?: string; year?: string }>
}) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()
  const { tenantId, from: fromParam, to: toParam, year } = await searchParams
  const { from, to, fromDate, toEndExclusive, toEndDate } = resolveMonthRange({ from: fromParam, to: toParam, year })

  const visibleBuildingIds = await getVisibleBuildingIds(orgId)
  const tenantOptions = await getDocumentTenantOptions(orgId)

  const selected = tenantId
    ? await db.tenant.findFirst({
        where: { id: tenantId, ...tenantScope(orgId) },
        include: {
          user: { select: { name: true } },
          space: { include: { floor: true } },
          charges: {
            where: { period: { gte: from, lte: to } },
            orderBy: { period: "asc" },
          },
          payments: {
            where: { paymentDate: { gte: fromDate, lt: toEndExclusive } },
            orderBy: { paymentDate: "asc" },
          },
        },
      })
    : null

  // Build ledger entries
  type Entry = { date: string; label: string; debit: number; credit: number }
  const entries: Entry[] = []

  if (selected) {
    for (const c of selected.charges) {
      entries.push({
        date: c.createdAt.toLocaleDateString("ru-RU"),
        label: `${CHARGE_TYPES[c.type] ?? c.type} · ${c.period}${c.description ? ` (${c.description})` : ""}`,
        debit: c.amount,
        credit: 0,
      })
    }
    for (const p of selected.payments) {
      entries.push({
        date: p.paymentDate.toLocaleDateString("ru-RU"),
        label: `Оплата · ${p.method}${p.note ? ` (${p.note})` : ""}`,
        debit: 0,
        credit: p.amount,
      })
    }
    entries.sort((a, b) => {
      const [da, ma, ya] = a.date.split(".").map(Number)
      const [db2, mb, yb] = b.date.split(".").map(Number)
      return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db2).getTime()
    })
  }

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0)
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0)
  const balance = totalDebit - totalCredit

  const building = await db.building.findFirst({
    where: {
      organizationId: orgId,
      ...(visibleBuildingIds.length > 0 ? { id: { in: visibleBuildingIds } } : {}),
    },
    orderBy: { isActive: "desc" },
  })
  const today = new Date().toLocaleDateString("ru-RU")
  const reconciliationNumber = building && selected
    ? await suggestDocumentNumber(building.id, "reconciliation")
    : null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 sm:text-2xl">Акт сверки</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Взаиморасчёты за период {fromDate.toLocaleDateString("ru-RU")} – {toEndDate.toLocaleDateString("ru-RU")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ReconciliationPeriodSelect from={from} to={to} />
          <div className="w-64">
            <TenantSelector tenants={tenantOptions} selectedId={tenantId} />
          </div>
          {selected && (
            <a
              href={`/api/reconciliation/generate?tenantId=${selected.id}&from=${from}&to=${to}`}
              download
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Download className="h-4 w-4" /> Скачать
            </a>
          )}
          {selected && <SendToTenantButton tenantId={selected.id} type="RECONCILIATION" from={from} to={to} />}
          {selected && <PrintButton />}
        </div>
      </div>

      {!selected && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 py-16 text-center">
          <p className="text-slate-400 dark:text-slate-500">Выберите арендатора для формирования акта сверки</p>
        </div>
      )}

      {selected && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 print-area">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">АКТ СВЕРКИ ВЗАИМНЫХ РАСЧЁТОВ</h2>
            {reconciliationNumber && (
              <p className="text-sm text-slate-700 dark:text-slate-300 font-medium mt-1">
                № <span className="font-mono">{reconciliationNumber}</span>
              </p>
            )}
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">за период с {fromDate.toLocaleDateString("ru-RU")} по {toEndDate.toLocaleDateString("ru-RU")}</p>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-6 text-sm">
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Арендодатель:</p>
              <p className="text-slate-700 dark:text-slate-300">{building?.name ?? "—"}</p>
              <p className="text-slate-500 dark:text-slate-400">{building?.address ?? ""}</p>
              {building?.phone && <p className="text-slate-500 dark:text-slate-400">Тел: {building.phone}</p>}
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Арендатор:</p>
              <p className="text-slate-700 dark:text-slate-300">{selected.companyName}</p>
              <p className="text-slate-500 dark:text-slate-400">{selected.user.name}</p>
              {selected.space && <p className="text-slate-500 dark:text-slate-400">Кабинет: {selected.space.number}</p>}
              {selected.bin && <p className="text-slate-500 dark:text-slate-400">БИН/ИИН: {selected.bin}</p>}
            </div>
          </div>

          <table className="w-full text-sm border-collapse mb-6">
            <thead>
              <tr className="border border-slate-300 bg-slate-50 dark:bg-slate-800/50">
                <th className="border border-slate-300 px-3 py-2 text-left text-xs">№</th>
                <th className="border border-slate-300 px-3 py-2 text-left text-xs">Дата</th>
                <th className="border border-slate-300 px-3 py-2 text-left text-xs">Наименование операции</th>
                <th className="border border-slate-300 px-3 py-2 text-right text-xs">Начислено (дебет), ₸</th>
                <th className="border border-slate-300 px-3 py-2 text-right text-xs">Оплачено (кредит), ₸</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} className="border border-slate-300">
                  <td className="border border-slate-300 px-3 py-2 text-slate-500 dark:text-slate-400 text-xs">{i + 1}</td>
                  <td className="border border-slate-300 px-3 py-2 text-xs whitespace-nowrap">{e.date}</td>
                  <td className="border border-slate-300 px-3 py-2 text-xs">{e.label}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right text-xs">
                    {e.debit > 0 ? e.debit.toLocaleString("ru-RU") : "—"}
                  </td>
                  <td className="border border-slate-300 px-3 py-2 text-right text-xs">
                    {e.credit > 0 ? e.credit.toLocaleString("ru-RU") : "—"}
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="border border-slate-300 px-3 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                    Нет операций за указанный период
                  </td>
                </tr>
              )}
              <tr className="border border-slate-300 bg-slate-50 dark:bg-slate-800/50 font-semibold">
                <td colSpan={3} className="border border-slate-300 px-3 py-2 text-xs">ИТОГО</td>
                <td className="border border-slate-300 px-3 py-2 text-right text-xs">{totalDebit.toLocaleString("ru-RU")}</td>
                <td className="border border-slate-300 px-3 py-2 text-right text-xs">{totalCredit.toLocaleString("ru-RU")}</td>
              </tr>
            </tbody>
          </table>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-5 py-4 mb-8 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Задолженность арендатора на {today}:</span>
              <span className={`font-bold text-base ${balance > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {balance >= 0 ? formatMoney(balance) : formatMoney(0)}
              </span>
            </div>
            {balance < 0 && (
              <div className="flex items-center justify-between mt-1">
                <span className="text-slate-600 dark:text-slate-400">Переплата арендатора:</span>
                <span className="font-bold text-base text-blue-600 dark:text-blue-400">{formatMoney(Math.abs(balance))}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-12 text-sm">
            <div className="space-y-6">
              <p className="font-semibold">От арендодателя:</p>
              <div className="border-b border-slate-400 mt-8 pt-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">подпись, расшифровка, дата</p>
              </div>
            </div>
            <div className="space-y-6">
              <p className="font-semibold">От арендатора:</p>
              <div className="border-b border-slate-400 mt-8 pt-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">подпись, расшифровка, дата</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <DocumentArchive organizationId={orgId} documentType="RECONCILIATION" />
    </div>
  )
}
