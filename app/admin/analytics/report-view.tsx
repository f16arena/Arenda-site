"use client"

import { useState } from "react"
import { Download, TrendingUp, TrendingDown, Receipt, Wallet, AlertCircle } from "lucide-react"
import { useLocale, useT } from "@/lib/i18n/client"
import { formatMoneyL } from "@/lib/i18n/format"
import type { OwnerPnL } from "@/lib/reports/owner-pnl"
import { Donut, IncomeExpenseChart, Waterfall } from "./charts"

type Basis = "accrual" | "cash"

export function ReportView({ data, exportHref }: { data: OwnerPnL; exportHref: string }) {
  const { t } = useT()
  const locale = useLocale()
  const money = (amount: number) => formatMoneyL(locale, amount)
  const [basis, setBasis] = useState<Basis>("accrual")

  const income = basis === "accrual" ? data.accrualIncome : data.cashIncome
  const rate = data.taxRatePercent / 100
  const tax = Math.round(income * rate)
  const net = income - data.expense - tax
  const margin = income > 0 ? Math.round((net / income) * 100) : 0

  const months = data.monthly.map((m) => {
    const mi = basis === "accrual" ? m.accrualIncome : m.cashIncome
    const mtax = Math.round(mi * rate)
    return { period: m.period, label: m.label, income: mi, expense: m.expense, net: mi - m.expense - mtax }
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
              {t("adminFinance.report.basisAccrual")}
            </button>
            <button
              onClick={() => setBasis("cash")}
              className={`border-l border-slate-200 px-3 py-1.5 dark:border-slate-800 ${basis === "cash" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"}`}
            >
              {t("adminFinance.report.basisCash")}
            </button>
          </div>
          <span className="text-[11.5px] text-slate-400 dark:text-slate-500">
            {basis === "accrual" ? t("adminFinance.report.basisAccrualHint") : t("adminFinance.report.basisCashHint")}
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
        <Card title={t("adminFinance.report.income")} value={money(income)} icon={TrendingUp} accent="emerald" />
        <Card
          title={t("adminFinance.report.expense")}
          value={money(data.expense)}
          icon={TrendingDown}
          accent="red"
          hint={data.expense === 0 ? t("adminFinance.report.expenseHint") : undefined}
        />
        <Card
          title={t("adminFinance.report.tax", { percent: data.taxRatePercent })}
          value={money(tax)}
          icon={Receipt}
          accent="amber"
          hint={t("adminFinance.report.taxHint")}
        />
        <Card
          title={t("adminFinance.report.net")}
          value={money(net)}
          icon={Wallet}
          accent={net >= 0 ? "blue" : "red"}
          hint={data.expense === 0 ? t("adminFinance.report.netHint") : undefined}
        />
      </div>

      {/* Водопад: как доход превращается в прибыль */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminFinance.report.waterfallTitle")}</h3>
          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${margin >= 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"}`}>
            {t("adminFinance.report.margin", { percent: margin })}
          </span>
        </div>
        <p className="mb-2 text-[11.5px] text-slate-400 dark:text-slate-500">
          {t("adminFinance.report.waterfallHint")}
        </p>
        {income > 0 ? (
          <Waterfall income={income} expense={data.expense} tax={tax} net={net} />
        ) : (
          <div className="flex h-[180px] items-center justify-center text-sm text-slate-400 dark:text-slate-500">
            {t("adminFinance.report.noIncome")}
          </div>
        )}
      </section>

      {/* Собираемость / долг */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MiniStat label={t("adminFinance.report.accrued")} value={money(data.accrued)} />
        <MiniStat
          label={t("adminFinance.report.collected")}
          value={money(data.collected)}
          sub={data.collectionRate !== null ? t("adminFinance.report.collectionRate", { percent: data.collectionRate }) : undefined}
        />
        <MiniStat
          label={t("adminFinance.report.outstanding")}
          value={money(data.outstandingDebt)}
          sub={data.outstandingDebtCount > 0
            ? t("adminFinance.report.outstandingSub", { count: data.outstandingDebtCount })
            : t("adminFinance.report.outstandingNone")}
          warn={data.outstandingDebt > 0}
        />
      </div>

      {/* График динамики */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminFinance.report.dynamics")}</h3>
        <IncomeExpenseChart months={months} />
      </section>

      {/* Пончики структуры */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminFinance.report.incomeStructure")}</h3>
          <p className="mb-3 text-[11.5px] text-slate-400 dark:text-slate-500">{t("adminFinance.report.incomeStructureHint")}</p>
          <Donut items={data.incomeByType} empty={t("adminFinance.report.incomeStructureEmpty")} />
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminFinance.report.expenseStructure")}</h3>
          <p className="mb-3 text-[11.5px] text-slate-400 dark:text-slate-500">{t("adminFinance.report.expenseStructureHint")}</p>
          <Donut items={data.expenseByCategory} empty={t("adminFinance.report.expenseStructureEmpty")} />
        </section>
      </div>

      <p className="flex items-start gap-1.5 text-[11.5px] text-slate-400 dark:text-slate-500">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t("adminFinance.report.disclaimer", { percent: data.taxRatePercent })}{" "}
        <a href="/admin/settings" className="underline hover:text-slate-600 dark:hover:text-slate-300">
          {t("adminFinance.report.disclaimerSettings")}
        </a>{" "}
        {t("adminFinance.report.disclaimerTail")}
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
