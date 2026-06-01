"use client"

import { useState } from "react"
import { Download, TrendingUp, TrendingDown, Receipt, Wallet, AlertCircle } from "lucide-react"
import { formatMoney } from "@/lib/utils"
import type { OwnerPnL } from "@/lib/reports/owner-pnl"
import { Donut, IncomeExpenseChart } from "./charts"

type Basis = "accrual" | "cash"

export function ReportView({ data, exportHref }: { data: OwnerPnL; exportHref: string }) {
  const [basis, setBasis] = useState<Basis>("accrual")

  const income = basis === "accrual" ? data.accrualIncome : data.cashIncome
  const rate = data.taxRatePercent / 100
  const tax = Math.round(income * rate)
  const net = income - data.expense - tax

  const months = data.monthly.map((m) => {
    const mi = basis === "accrual" ? m.accrualIncome : m.cashIncome
    const mtax = Math.round(mi * rate)
    return { label: m.label, income: mi, expense: m.expense, net: mi - m.expense - mtax }
  })

  return (
    <div className="space-y-5">
      {/* Переключатель базы + экспорт */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-xs dark:border-slate-800">
            <button
              onClick={() => setBasis("accrual")}
              className={`px-3 py-1.5 ${basis === "accrual" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"}`}
            >
              По начислению
            </button>
            <button
              onClick={() => setBasis("cash")}
              className={`border-l border-slate-200 px-3 py-1.5 dark:border-slate-800 ${basis === "cash" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"}`}
            >
              По оплате
            </button>
          </div>
          <span className="text-[11.5px] text-slate-400 dark:text-slate-500">
            {basis === "accrual" ? "что выставлено за период" : "что фактически поступило"}
          </span>
        </div>
        <a
          href={exportHref}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Download className="h-3.5 w-3.5" /> Excel
        </a>
      </div>

      {/* Карточки P&L */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card title="Доход" value={formatMoney(income)} icon={TrendingUp} accent="emerald" />
        <Card title="Расход" value={formatMoney(data.expense)} icon={TrendingDown} accent="red" />
        <Card title={`Налог · ${data.taxRatePercent}%`} value={formatMoney(tax)} icon={Receipt} accent="amber" hint="с оборота, оценочно" />
        <Card title="Чистая прибыль" value={formatMoney(net)} icon={Wallet} accent={net >= 0 ? "blue" : "red"} />
      </div>

      {/* Собираемость / долг */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MiniStat label="Начислено за период" value={formatMoney(data.accrued)} />
        <MiniStat label="Собрано (оплачено)" value={formatMoney(data.collected)} sub={data.collectionRate !== null ? `${data.collectionRate}% собираемость` : undefined} />
        <MiniStat
          label="Текущий долг"
          value={formatMoney(data.outstandingDebt)}
          sub={data.outstandingDebtCount > 0 ? `${data.outstandingDebtCount} неоплаченных начислений` : "нет долгов"}
          warn={data.outstandingDebt > 0}
        />
      </div>

      {/* График динамики */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Динамика за 12 месяцев</h3>
        <IncomeExpenseChart months={months} />
      </section>

      {/* Пончики структуры */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Структура доходов</h3>
          <p className="mb-3 text-[11.5px] text-slate-400 dark:text-slate-500">по типам начислений за период</p>
          <Donut items={data.incomeByType} empty="Нет начислений за период" />
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Структура расходов</h3>
          <p className="mb-3 text-[11.5px] text-slate-400 dark:text-slate-500">куда уходят деньги</p>
          <Donut items={data.expenseByCategory} empty="Расходы за период не внесены" />
        </section>
      </div>

      <p className="flex items-start gap-1.5 text-[11.5px] text-slate-400 dark:text-slate-500">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Оценочный отчёт, не заменяет бухгалтерский учёт. Налог ({data.taxRatePercent}%) считается от оборота; депозиты исключены из дохода. Ставку можно изменить в{" "}
        <a href="/admin/settings" className="underline hover:text-slate-600 dark:hover:text-slate-300">Настройках</a> (по новому НК РК с 2026 упрощёнка = 4%, маслихат может корректировать 2–6%). Расходы видны только если внесены в разделе «Финансы».
      </p>
    </div>
  )
}

const ACCENTS: Record<string, string> = {
  emerald: "text-emerald-600 dark:text-emerald-400",
  red: "text-red-600 dark:text-red-400",
  amber: "text-amber-600 dark:text-amber-400",
  blue: "text-blue-600 dark:text-blue-400",
}

function Card({ title, value, icon: Icon, accent, hint }: { title: string; value: string; icon: typeof Wallet; accent: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{title}</span>
        <Icon className={`h-4 w-4 ${ACCENTS[accent] ?? ""}`} />
      </div>
      <div className={`text-lg font-bold tabular-nums ${ACCENTS[accent] ?? "text-slate-900 dark:text-slate-100"}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[10.5px] text-slate-400 dark:text-slate-500">{hint}</div>}
    </div>
  )
}

function MiniStat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`mt-0.5 text-base font-semibold tabular-nums ${warn ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100"}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 dark:text-slate-500">{sub}</div>}
    </div>
  )
}
