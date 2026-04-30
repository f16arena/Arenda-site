import { TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

export type MonthData = {
  period: string  // "2026-04"
  income: number
  expense: number
  forecast?: boolean
}

export function CashflowChart({ months }: { months: MonthData[] }) {
  if (months.length === 0) return null

  const maxValue = Math.max(...months.map((m) => Math.max(m.income, m.expense)), 1)
  const totalIncome = months.reduce((s, m) => s + m.income, 0)
  const totalExpense = months.reduce((s, m) => s + m.expense, 0)
  const net = totalIncome - totalExpense

  const monthLabels = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"]
  const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU")

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            Cashflow за {months.length} месяцев
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">
            <span className="text-emerald-600 font-medium">+{fmt(totalIncome)} ₸</span>
            {" / "}
            <span className="text-red-500 font-medium">−{fmt(totalExpense)} ₸</span>
            {" = "}
            <span className={cn("font-semibold", net >= 0 ? "text-emerald-600" : "text-red-600")}>
              {net >= 0 ? "+" : ""}{fmt(net)} ₸
            </span>
          </p>
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-end gap-2 h-48">
          {months.map((m) => {
            const [, mm] = m.period.split("-")
            const monthLabel = monthLabels[parseInt(mm) - 1]
            const incomeH = (m.income / maxValue) * 100
            const expenseH = (m.expense / maxValue) * 100
            return (
              <div key={m.period} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="flex-1 flex items-end justify-center gap-0.5 w-full">
                  <div
                    className={cn(
                      "flex-1 rounded-t transition-all",
                      m.forecast ? "bg-emerald-200 border-2 border-emerald-300 border-dashed" : "bg-emerald-500"
                    )}
                    style={{ height: `${incomeH}%` }}
                    title={`Доход: ${fmt(m.income)} ₸${m.forecast ? " (прогноз)" : ""}`}
                  />
                  <div
                    className={cn(
                      "flex-1 rounded-t transition-all",
                      m.forecast ? "bg-red-200 border-2 border-red-300 border-dashed" : "bg-red-400"
                    )}
                    style={{ height: `${expenseH}%` }}
                    title={`Расход: ${fmt(m.expense)} ₸${m.forecast ? " (прогноз)" : ""}`}
                  />
                </div>
                <p className={cn(
                  "text-[10px] font-medium",
                  m.forecast ? "text-slate-400 dark:text-slate-500" : "text-slate-500 dark:text-slate-400 dark:text-slate-500"
                )}>
                  {monthLabel}
                </p>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500" /> Доход</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-400" /> Расход</div>
          <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-200 border border-emerald-300 border-dashed" /> Прогноз</div>
        </div>
      </div>
    </div>
  )
}
