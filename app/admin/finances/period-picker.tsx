"use client"

import { useRouter } from "next/navigation"
import { CalendarClock } from "lucide-react"

/** Выбор месяца для страницы финансов (?period=YYYY-MM). */
export function FinancesPeriodPicker({ period }: { period: string }) {
  const router = useRouter()
  return (
    <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
      <CalendarClock className="h-4 w-4 text-slate-400 dark:text-slate-500" />
      <span className="text-xs text-slate-500 dark:text-slate-400">Период</span>
      <input
        type="month"
        value={period}
        onChange={(e) => {
          const v = e.target.value
          if (/^\d{4}-\d{2}$/.test(v)) router.push(`/admin/finances?period=${v}`)
        }}
        className="bg-transparent text-sm text-slate-800 outline-none dark:text-slate-100"
      />
    </label>
  )
}
