import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { formatMoney } from "@/lib/utils"
import { TenantSelector, PrintButton } from "../tenant-selector"

const CHARGE_TYPES: Record<string, string> = {
  RENT: "Аренда", ELECTRICITY: "Электричество", WATER: "Вода",
  HEATING: "Отопление", CLEANING: "Уборка", PENALTY: "Пеня", OTHER: "Прочее",
}

export default async function ReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ tenantId?: string; year?: string }>
}) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")

  const { tenantId, year } = await searchParams
  const currentYear = new Date().getFullYear()
  const selectedYear = parseInt(year ?? String(currentYear))

  const tenants = await db.tenant.findMany({
    include: { user: { select: { name: true } }, space: true },
    orderBy: { companyName: "asc" },
  })

  const selected = tenantId
    ? await db.tenant.findUnique({
        where: { id: tenantId },
        include: {
          user: { select: { name: true } },
          space: { include: { floor: true } },
          charges: {
            where: { period: { startsWith: String(selectedYear) } },
            orderBy: { period: "asc" },
          },
          payments: {
            where: {
              paymentDate: {
                gte: new Date(selectedYear, 0, 1),
                lt: new Date(selectedYear + 1, 0, 1),
              },
            },
            orderBy: { paymentDate: "asc" },
          },
        },
      })
    : null

  const tenantOptions = tenants.map((t) => ({
    id: t.id,
    companyName: t.companyName,
    userName: t.user.name,
    spaceNumber: t.space?.number,
  }))

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

  const building = await db.building.findFirst({ where: { isActive: true } })
  const today = new Date().toLocaleDateString("ru-RU")

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Акт сверки</h1>
          <p className="text-sm text-slate-500 mt-0.5">Взаиморасчёты за {selectedYear} год</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedYear}
            onChange={undefined}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
          >
            {[currentYear - 1, currentYear].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <div className="w-64">
            <TenantSelector tenants={tenantOptions} selectedId={tenantId} />
          </div>
          {selected && <PrintButton />}
        </div>
      </div>

      {!selected && (
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
          <p className="text-slate-400">Выберите арендатора для формирования акта сверки</p>
        </div>
      )}

      {selected && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 print-area">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-lg font-bold text-slate-900">АКТ СВЕРКИ ВЗАИМНЫХ РАСЧЁТОВ</h2>
            <p className="text-sm text-slate-600 mt-1">за период с 01.01.{selectedYear} по 31.12.{selectedYear}</p>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-6 text-sm">
            <div>
              <p className="font-semibold text-slate-900 mb-1">Арендодатель:</p>
              <p className="text-slate-700">{building?.name ?? "—"}</p>
              <p className="text-slate-500">{building?.address ?? ""}</p>
              {building?.phone && <p className="text-slate-500">Тел: {building.phone}</p>}
            </div>
            <div>
              <p className="font-semibold text-slate-900 mb-1">Арендатор:</p>
              <p className="text-slate-700">{selected.companyName}</p>
              <p className="text-slate-500">{selected.user.name}</p>
              {selected.space && <p className="text-slate-500">Кабинет: {selected.space.number}</p>}
              {selected.bin && <p className="text-slate-500">БИН/ИИН: {selected.bin}</p>}
            </div>
          </div>

          <table className="w-full text-sm border-collapse mb-6">
            <thead>
              <tr className="border border-slate-300 bg-slate-50">
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
                  <td className="border border-slate-300 px-3 py-2 text-slate-500 text-xs">{i + 1}</td>
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
                  <td colSpan={5} className="border border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
                    Нет операций за указанный период
                  </td>
                </tr>
              )}
              <tr className="border border-slate-300 bg-slate-50 font-semibold">
                <td colSpan={3} className="border border-slate-300 px-3 py-2 text-xs">ИТОГО</td>
                <td className="border border-slate-300 px-3 py-2 text-right text-xs">{totalDebit.toLocaleString("ru-RU")}</td>
                <td className="border border-slate-300 px-3 py-2 text-right text-xs">{totalCredit.toLocaleString("ru-RU")}</td>
              </tr>
            </tbody>
          </table>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-5 py-4 mb-8 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Задолженность арендатора на {today}:</span>
              <span className={`font-bold text-base ${balance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                {balance >= 0 ? formatMoney(balance) : formatMoney(0)}
              </span>
            </div>
            {balance < 0 && (
              <div className="flex items-center justify-between mt-1">
                <span className="text-slate-600">Переплата арендатора:</span>
                <span className="font-bold text-base text-blue-600">{formatMoney(Math.abs(balance))}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-12 text-sm">
            <div className="space-y-6">
              <p className="font-semibold">От арендодателя:</p>
              <div className="border-b border-slate-400 mt-8 pt-2">
                <p className="text-xs text-slate-500">подпись, расшифровка, дата</p>
              </div>
            </div>
            <div className="space-y-6">
              <p className="font-semibold">От арендатора:</p>
              <div className="border-b border-slate-400 mt-8 pt-2">
                <p className="text-xs text-slate-500">подпись, расшифровка, дата</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
