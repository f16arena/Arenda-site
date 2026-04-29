"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
]

interface Props {
  value?: string  // YYYY-MM
}

/**
 * Селектор периода (год + месяц) для страниц шаблонов документов.
 * Меняет ?period=YYYY-MM в URL.
 */
export function PeriodPicker({ value }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const today = new Date()
  const [yStr, mStr] = (value ?? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`).split("-")
  const year = parseInt(yStr)
  const month = parseInt(mStr)

  function setPeriod(y: number, m: number) {
    const next = `${y}-${String(m).padStart(2, "0")}`
    const params = new URLSearchParams(searchParams.toString())
    params.set("period", next)
    router.push(`${pathname}?${params.toString()}`)
  }

  function shift(delta: number) {
    let y = year, m = month + delta
    while (m < 1) { m += 12; y -= 1 }
    while (m > 12) { m -= 12; y += 1 }
    setPeriod(y, m)
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white">
      <button
        onClick={() => shift(-1)}
        className="px-2 py-1.5 hover:bg-slate-50 rounded-l-lg"
        title="Предыдущий месяц"
      >
        <ChevronLeft className="h-4 w-4 text-slate-500" />
      </button>
      <select
        value={month}
        onChange={(e) => setPeriod(year, parseInt(e.target.value))}
        className="bg-transparent text-sm font-medium text-slate-700 px-1 py-1.5 focus:outline-none cursor-pointer"
      >
        {MONTHS.map((name, i) => (
          <option key={i + 1} value={i + 1}>{name}</option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => setPeriod(parseInt(e.target.value), month)}
        className="bg-transparent text-sm font-medium text-slate-700 px-1 py-1.5 focus:outline-none cursor-pointer border-l border-slate-200"
      >
        {Array.from({ length: 6 }, (_, i) => today.getFullYear() - 2 + i).map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <button
        onClick={() => shift(1)}
        className="px-2 py-1.5 hover:bg-slate-50 rounded-r-lg"
        title="Следующий месяц"
      >
        <ChevronRight className="h-4 w-4 text-slate-500" />
      </button>
    </div>
  )
}
