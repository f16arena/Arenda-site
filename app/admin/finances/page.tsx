export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { formatMoney, formatPeriod, CHARGE_TYPES } from "@/lib/utils"
import { Download, Plus, FileSpreadsheet, Upload } from "lucide-react"
import Link from "next/link"
import { PaymentDialog, ExpenseDialog, GenerateChargesButton, PenaltyButton } from "./finance-actions"
import { DeleteAction } from "@/components/ui/delete-action"
import { deleteCharge, deletePayment, deleteExpense } from "@/app/actions/finance"

export default async function FinancesPage() {
  const currentPeriod = new Date().toISOString().slice(0, 7) // YYYY-MM

  const [charges, payments, expenses] = await Promise.all([
    db.charge.findMany({
      where: { period: currentPeriod },
      select: {
        id: true, tenantId: true, period: true, type: true, amount: true,
        description: true, isPaid: true, dueDate: true, createdAt: true,
        tenant: { select: { id: true, companyName: true } },
      },
      orderBy: { createdAt: "desc" },
    }).catch(() => []),
    db.payment.findMany({
      orderBy: { paymentDate: "desc" },
      take: 20,
      select: {
        id: true, tenantId: true, amount: true, method: true,
        paymentDate: true, note: true,
        tenant: { select: { id: true, companyName: true } },
      },
    }).catch(() => []),
    db.expense.findMany({
      where: { period: currentPeriod },
      select: {
        id: true, buildingId: true, category: true, amount: true,
        period: true, description: true, date: true,
      },
      orderBy: { date: "desc" },
    }).catch(() => []),
  ])

  const totalCharges = charges.reduce((s, c) => s + c.amount, 0)
  const paidCharges = charges.filter((c) => c.isPaid).reduce((s, c) => s + c.amount, 0)
  const unpaidCharges = charges.filter((c) => !c.isPaid).reduce((s, c) => s + c.amount, 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  const totalPayments = payments
    .filter((p) => p.paymentDate.toISOString().slice(0, 7) === currentPeriod)
    .reduce((s, p) => s + p.amount, 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Финансы</h1>
          <p className="text-sm text-slate-500 mt-0.5">{formatPeriod(currentPeriod)}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/admin/finances/import"
            className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 px-4 py-2 text-sm font-medium text-blue-700"
          >
            <Upload className="h-4 w-4" />
            Импорт банка
          </Link>
          <a
            href="/api/export/1c"
            download
            className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 px-4 py-2 text-sm font-medium text-amber-700"
            title="Экспорт в формате 1C-Enterprise"
          >
            <FileSpreadsheet className="h-4 w-4" />
            1С
          </a>
          <a
            href="/api/export/finances"
            download
            className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-4 py-2 text-sm font-medium text-emerald-700"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </a>
          <PenaltyButton />
          <GenerateChargesButton />
          <ExpenseDialog />
          <PaymentDialog
            tenants={charges.map((c) => c.tenant).filter((t, i, arr) => arr.findIndex((x) => x.id === t.id) === i).map((t) => ({ id: t.id, companyName: t.companyName }))}
            unpaidCharges={charges.filter((c) => !c.isPaid).map((c) => ({ id: c.id, tenantId: c.tenantId, type: CHARGE_TYPES[c.type] ?? c.type, amount: c.amount, description: c.description, period: c.period, isPaid: c.isPaid }))}
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Начислено", value: formatMoney(totalCharges), sub: "за месяц", color: "text-slate-900" },
          { label: "Оплачено", value: formatMoney(paidCharges), sub: "получено", color: "text-emerald-600" },
          { label: "Долг", value: formatMoney(unpaidCharges), sub: "не оплачено", color: "text-red-600" },
          { label: "Расходы", value: formatMoney(totalExpenses), sub: "в этом месяце", color: "text-orange-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            <p className="text-xs text-slate-400 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Charges */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Начисления за {formatPeriod(currentPeriod)}</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {charges.slice(0, 10).map((c) => (
              <div key={c.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{c.tenant.companyName}</p>
                  <p className="text-xs text-slate-400">{CHARGE_TYPES[c.type] ?? c.type}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-900">{formatMoney(c.amount)}</p>
                    <span className={`text-xs ${c.isPaid ? "text-emerald-600" : "text-red-500"}`}>
                      {c.isPaid ? "Оплачено" : "Не оплачено"}
                    </span>
                  </div>
                  <DeleteAction
                    action={deleteCharge.bind(null, c.id)}
                    entity="начисление"
                    successMessage="Начисление удалено"
                  />
                </div>
              </div>
            ))}
            {charges.length === 0 && (
              <p className="px-5 py-8 text-sm text-slate-400 text-center">Нет начислений</p>
            )}
          </div>
        </div>

        {/* Payments */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Последние оплаты</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {payments.slice(0, 10).map((p) => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{p.tenant.companyName}</p>
                  <p className="text-xs text-slate-400">
                    {p.paymentDate.toLocaleDateString("ru-RU")} · {p.method}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold text-emerald-600">{formatMoney(p.amount)}</p>
                  <DeleteAction
                    action={deletePayment.bind(null, p.id)}
                    entity="платёж"
                    successMessage="Платёж удалён"
                  />
                </div>
              </div>
            ))}
            {payments.length === 0 && (
              <p className="px-5 py-8 text-sm text-slate-400 text-center">Нет оплат</p>
            )}
          </div>
        </div>
      </div>

      {/* Expenses */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Расходы</h2>
          <button className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
            <Plus className="h-3 w-3" />
            Добавить
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Категория</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Описание</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Дата</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Сумма</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-b border-slate-50">
                <td className="px-5 py-3 text-slate-700">{e.category}</td>
                <td className="px-5 py-3 text-slate-500">{e.description ?? "—"}</td>
                <td className="px-5 py-3 text-slate-500">{e.date.toLocaleDateString("ru-RU")}</td>
                <td className="px-5 py-3 text-right font-medium text-orange-600">{formatMoney(e.amount)}</td>
                <td className="px-5 py-3 text-right">
                  <DeleteAction
                    action={deleteExpense.bind(null, e.id)}
                    entity="расход"
                    successMessage="Расход удалён"
                  />
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-400">
                  Расходы не добавлены
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
