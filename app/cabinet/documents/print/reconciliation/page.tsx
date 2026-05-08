export const dynamic = "force-dynamic"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { formatMoney } from "@/lib/utils"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { CabinetPrintButton } from "../print-button"

const CHARGE_TYPES: Record<string, string> = {
  RENT: "Аренда", ELECTRICITY: "Электричество", WATER: "Вода",
  HEATING: "Отопление", GARBAGE: "Вывоз мусора", SECURITY: "Охрана",
  INTERNET: "Интернет", GAS: "Газ", CLEANING: "Уборка", PENALTY: "Пеня", OTHER: "Прочее",
}

/**
 * Печатная форма «Акт сверки» в кабинете арендатора.
 * Период по умолчанию: текущий месяц + 6 предыдущих. Можно переопределить
 * через ?from=YYYY-MM&to=YYYY-MM. Стилевой паттерн копирует
 * /admin/documents/templates/reconciliation.
 */
export default async function CabinetReconciliationPrint({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const session = await auth()
  if (!session) redirect("/login")
  const { from, to } = await searchParams

  const today = new Date()
  const defaultTo = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
  const sixMonthsBack = new Date(today.getFullYear(), today.getMonth() - 6, 1)
  const defaultFrom = `${sixMonthsBack.getFullYear()}-${String(sixMonthsBack.getMonth() + 1).padStart(2, "0")}`
  const fromPeriod = isValidPeriod(from) ? from! : defaultFrom
  const toPeriod = isValidPeriod(to) ? to! : defaultTo

  const fromDate = parsePeriodStart(fromPeriod)
  const toDate = parsePeriodEnd(toPeriod) // последний день месяца

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    include: {
      user: { select: { organizationId: true } },
      charges: {
        where: {
          period: { gte: fromPeriod, lte: toPeriod },
        },
        orderBy: { period: "asc" },
      },
      payments: {
        where: {
          paymentDate: { gte: fromDate, lte: toDate },
        },
        orderBy: { paymentDate: "asc" },
      },
    },
  })

  if (!tenant) redirect("/cabinet/documents")

  const orgId = tenant.user.organizationId ?? session.user.organizationId
  const landlord = orgId ? await getOrganizationRequisites(orgId) : null

  // Opening balance — всё что было до периода
  const [priorChargesAgg, priorPaymentsAgg] = await Promise.all([
    db.charge.aggregate({
      where: { tenantId: tenant.id, period: { lt: fromPeriod }, deletedAt: null },
      _sum: { amount: true },
    }),
    db.payment.aggregate({
      where: { tenantId: tenant.id, paymentDate: { lt: fromDate }, deletedAt: null },
      _sum: { amount: true },
    }),
  ])
  const openingBalance = (priorChargesAgg._sum.amount ?? 0) - (priorPaymentsAgg._sum.amount ?? 0)

  type Entry = { date: string; label: string; debit: number; credit: number }
  const entries: Entry[] = []
  for (const c of tenant.charges) {
    entries.push({
      date: c.createdAt.toLocaleDateString("ru-RU"),
      label: `${CHARGE_TYPES[c.type] ?? c.type} · ${c.period}${c.description ? ` (${c.description})` : ""}`,
      debit: c.amount,
      credit: 0,
    })
  }
  for (const p of tenant.payments) {
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

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0)
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0)
  const closingBalance = openingBalance + totalDebit - totalCredit

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <Link href="/cabinet/documents" className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Акт сверки</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Период {fromPeriod} — {toPeriod}</p>
          </div>
        </div>
        <CabinetPrintButton />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 print-area">
        <div className="text-center mb-8">
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">АКТ СВЕРКИ ВЗАИМНЫХ РАСЧЁТОВ</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">за период {fromPeriod} — {toPeriod}</p>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-6 text-sm">
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Арендодатель:</p>
            {landlord ? (
              <>
                <p className="text-slate-700 dark:text-slate-300">{landlord.fullName}</p>
                <p className="text-slate-500 dark:text-slate-400">{landlord.legalAddress}</p>
                <p className="text-slate-500 dark:text-slate-400">{landlord.taxIdLabel}: {landlord.taxId}</p>
              </>
            ) : (
              <p className="text-slate-500 dark:text-slate-400">—</p>
            )}
          </div>
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1">Арендатор:</p>
            <p className="text-slate-700 dark:text-slate-300">{tenant.companyName}</p>
            {tenant.legalAddress && <p className="text-slate-500 dark:text-slate-400">{tenant.legalAddress}</p>}
            {tenant.bin && <p className="text-slate-500 dark:text-slate-400">БИН: {tenant.bin}</p>}
            {tenant.iin && !tenant.bin && <p className="text-slate-500 dark:text-slate-400">ИИН: {tenant.iin}</p>}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-2 mb-3 text-sm flex justify-between">
          <span className="text-slate-600 dark:text-slate-400">Сальдо на начало периода:</span>
          <span className={`font-semibold ${openingBalance > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
            {formatMoney(openingBalance)}
          </span>
        </div>

        <table className="w-full text-sm border-collapse mb-4">
          <thead>
            <tr className="border border-slate-300 bg-slate-50 dark:bg-slate-800/50">
              <th className="border border-slate-300 px-3 py-2 text-left text-xs">№</th>
              <th className="border border-slate-300 px-3 py-2 text-left text-xs">Дата</th>
              <th className="border border-slate-300 px-3 py-2 text-left text-xs">Операция</th>
              <th className="border border-slate-300 px-3 py-2 text-right text-xs">Начислено, ₸</th>
              <th className="border border-slate-300 px-3 py-2 text-right text-xs">Оплачено, ₸</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} className="border border-slate-300">
                <td className="border border-slate-300 px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{i + 1}</td>
                <td className="border border-slate-300 px-3 py-2 text-xs whitespace-nowrap">{e.date}</td>
                <td className="border border-slate-300 px-3 py-2 text-xs">{e.label}</td>
                <td className="border border-slate-300 px-3 py-2 text-right text-xs">{e.debit > 0 ? e.debit.toLocaleString("ru-RU") : "—"}</td>
                <td className="border border-slate-300 px-3 py-2 text-right text-xs">{e.credit > 0 ? e.credit.toLocaleString("ru-RU") : "—"}</td>
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
              <td colSpan={3} className="border border-slate-300 px-3 py-2 text-xs">ИТОГО за период</td>
              <td className="border border-slate-300 px-3 py-2 text-right text-xs">{totalDebit.toLocaleString("ru-RU")}</td>
              <td className="border border-slate-300 px-3 py-2 text-right text-xs">{totalCredit.toLocaleString("ru-RU")}</td>
            </tr>
          </tbody>
        </table>

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-5 py-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600 dark:text-slate-400">Сальдо на конец периода (задолженность):</span>
            <span className={`font-bold text-base ${closingBalance > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {closingBalance >= 0 ? formatMoney(closingBalance) : `Переплата: ${formatMoney(Math.abs(closingBalance))}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function isValidPeriod(value: string | undefined): boolean {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

function parsePeriodStart(period: string): Date {
  const [year, month] = period.split("-").map(Number)
  return new Date(year, month - 1, 1)
}

function parsePeriodEnd(period: string): Date {
  const [year, month] = period.split("-").map(Number)
  // последний день месяца, 23:59:59
  return new Date(year, month, 0, 23, 59, 59, 999)
}
