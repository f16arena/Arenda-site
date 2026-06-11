import { TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

export type MonthData = {
  period: string  // "2026-04"
  income: number
  expense: number
  forecast?: boolean
}

const MONTH_LABELS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"]

/** 16 311 750 → «16,3 млн», 250 000 → «250 тыс» */
function fmtCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн`
  if (abs >= 1_000) return `${Math.round(n / 1_000).toLocaleString("ru-RU")} тыс`
  return Math.round(n).toLocaleString("ru-RU")
}

export function CashflowChart({ months }: { months: MonthData[] }) {
  if (months.length === 0) return null

  // Пустые месяцы в начале (история без платежей) не рисуем — они съедали
  // половину графика «воздухом». Начинаем с первого месяца с данными.
  const firstWithData = months.findIndex((m) => m.income > 0 || m.expense > 0)
  const visible = firstWithData > 0 ? months.slice(firstWithData) : months
  const hasFacts = visible.some((m) => !m.forecast && (m.income > 0 || m.expense > 0))

  const maxValue = Math.max(...visible.map((m) => Math.max(m.income, m.expense)), 1)
  const totalIncome = visible.reduce((s, m) => s + m.income, 0)
  const totalExpense = visible.reduce((s, m) => s + m.expense, 0)
  const net = totalIncome - totalExpense

  const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU")
  // Текущий месяц — для подсветки колонки
  const nowPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  // Деления оси Y: max / 2 / 0
  const ticks = [maxValue, maxValue / 2]

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            Cashflow · {visible.length} мес
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">+{fmt(totalIncome)} ₸</span>
            {" / "}
            <span className="text-red-500 font-medium">−{fmt(totalExpense)} ₸</span>
            {" = "}
            <span className={cn("font-semibold", net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
              {net >= 0 ? "+" : ""}{fmt(net)} ₸
            </span>
          </p>
        </div>
        {!hasFacts && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            Фактических платежей ещё нет — показан прогноз по договорам
          </span>
        )}
      </div>

      <div className="p-5 pt-4">
        <div className="flex gap-3">
          {/* Ось Y */}
          <div className="relative h-44 w-12 shrink-0 text-right">
            <span className="absolute right-0 top-0 -translate-y-1/2 text-[10px] tabular-nums text-slate-400">{fmtCompact(maxValue)}</span>
            <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[10px] tabular-nums text-slate-400">{fmtCompact(maxValue / 2)}</span>
            <span className="absolute bottom-0 right-0 translate-y-1/2 text-[10px] tabular-nums text-slate-400">0</span>
          </div>
          {/* Поле графика: фиксированная высота, чтобы проценты столбиков работали */}
          <div className="relative h-44 flex-1">
            {/* Сетка */}
            <div className="absolute inset-x-0 top-0 border-t border-dashed border-slate-100 dark:border-slate-800" />
            {ticks.length > 1 && <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-100 dark:border-slate-800" />}
            <div className="absolute inset-x-0 bottom-0 border-t border-slate-200 dark:border-slate-700" />
            <div className="absolute inset-0 flex items-end gap-1.5 sm:gap-2">
              {visible.map((m) => {
                const [, mm] = m.period.split("-")
                const monthLabel = MONTH_LABELS[parseInt(mm) - 1]
                const incomeH = Math.max((m.income / maxValue) * 100, m.income > 0 ? 2 : 0)
                const expenseH = Math.max((m.expense / maxValue) * 100, m.expense > 0 ? 2 : 0)
                const monthNet = m.income - m.expense
                const isCurrent = m.period === nowPeriod
                return (
                  <div key={m.period} className={cn("group relative h-full flex-1 rounded-t", isCurrent && "bg-blue-50/60 dark:bg-blue-500/5")}>
                    {/* Тултип */}
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[10px] leading-relaxed text-white shadow-lg group-hover:block dark:bg-slate-700">
                      <span className="font-semibold">{monthLabel} {m.period.slice(0, 4)}{m.forecast ? " · прогноз" : ""}</span>
                      <br />Доход: {fmt(m.income)} ₸
                      <br />Расход: {fmt(m.expense)} ₸
                      <br />Итог: <span className={monthNet >= 0 ? "text-emerald-300" : "text-red-300"}>{monthNet >= 0 ? "+" : ""}{fmt(monthNet)} ₸</span>
                    </div>
                    <div className="flex h-full items-end justify-center gap-[3px] px-0.5">
                      <div
                        className={cn(
                          "w-full max-w-[14px] rounded-t transition-all group-hover:opacity-80",
                          m.forecast ? "bg-emerald-400/35 dark:bg-emerald-500/25 [background-image:repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.35)_3px,rgba(255,255,255,0.35)_6px)]" : "bg-emerald-500",
                        )}
                        style={{ height: `${incomeH}%` }}
                      />
                      <div
                        className={cn(
                          "w-full max-w-[14px] rounded-t transition-all group-hover:opacity-80",
                          m.forecast ? "bg-red-400/35 dark:bg-red-500/25 [background-image:repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.35)_3px,rgba(255,255,255,0.35)_6px)]" : "bg-red-400",
                        )}
                        style={{ height: `${expenseH}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        {/* Подписи месяцев */}
        <div className="ml-[60px] flex gap-1.5 sm:gap-2">
          {visible.map((m) => {
            const [, mm] = m.period.split("-")
            const isCurrent = m.period === nowPeriod
            return (
              <p
                key={m.period}
                className={cn(
                  "flex-1 pt-1.5 text-center text-[10px] font-medium",
                  isCurrent ? "text-blue-600 dark:text-blue-400" : m.forecast ? "text-slate-300 dark:text-slate-600" : "text-slate-500 dark:text-slate-400",
                )}
              >
                {MONTH_LABELS[parseInt(mm) - 1]}
              </p>
            )
          })}
        </div>
        <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-500" /> Доход</div>
          <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-red-400" /> Расход</div>
          <div className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-400/35 [background-image:repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.5)_3px,rgba(255,255,255,0.5)_6px)]" /> Прогноз</div>
          <span className="ml-auto hidden text-slate-400 sm:inline">наведите на месяц — детали</span>
        </div>
      </div>
    </div>
  )
}
