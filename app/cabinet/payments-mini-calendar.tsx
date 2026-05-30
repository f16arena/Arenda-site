"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { formatMoney } from "@/lib/utils"

interface ChargeRow {
  id: string
  amount: number
  type: string
  period: string
  isPaid: boolean
  dueDate: string | null
}

interface PaymentRow {
  id: string
  amount: number
  paymentDate: string
}

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
]
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

/**
 * Календарь платежей арендатора — в том же стиле, что у владельца (/admin/calendar):
 * фиксированная высота ячеек, рамки, цветные точки событий + счётчик.
 * Синие — к оплате, красные — просрочка, зелёные — оплачено.
 */
export function PaymentsMiniCalendar({
  charges, payments, paymentDueDay,
}: {
  charges: ChargeRow[]
  payments: PaymentRow[]
  paymentDueDay: number
}) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selected, setSelected] = useState<string | null>(null)

  const monthStart = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0).getDate()
  const startWeekday = (monthStart.getDay() + 6) % 7

  type Cell = {
    day: number
    dateKey: string
    dueCharges: ChargeRow[]
    paidThisDay: number
    isExpectedRent: boolean
  }
  const cells: (Cell | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= lastDay; d++) {
    const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    const dueCharges = charges.filter((c) => c.dueDate && c.dueDate.slice(0, 10) === dateKey)
    const paidThisDay = payments
      .filter((p) => p.paymentDate.slice(0, 10) === dateKey)
      .reduce((s, p) => s + p.amount, 0)
    cells.push({ day: d, dateKey, dueCharges, paidThisDay, isExpectedRent: d === paymentDueDay })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  function nav(delta: number) {
    let m = month + delta
    let y = year
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setMonth(m); setYear(y); setSelected(null)
  }
  function goToday() {
    setYear(today.getFullYear()); setMonth(today.getMonth()); setSelected(null)
  }

  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

  // События выбранного дня
  const selCell = selected ? cells.find((c) => c && c.dateKey === selected) as Cell | undefined : undefined

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => nav(-1)} aria-label="Предыдущий месяц"
              className="rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 p-2">
              <ChevronLeft className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            </button>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 min-w-[160px] text-center">
              {MONTHS[month]} {year}
            </h2>
            <button type="button" onClick={() => nav(1)} aria-label="Следующий месяц"
              className="rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 p-2">
              <ChevronRight className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            </button>
          </div>
          <button type="button" onClick={goToday}
            className="rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300">
            Сегодня
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Сетка */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((cell, i) => {
              if (!cell) {
                return <div key={i} className="h-16 border-b border-r border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20" />
              }
              const isToday = cell.dateKey === todayKey
              const isSelected = cell.dateKey === selected
              const hasOverdue = cell.dueCharges.some((c) => !c.isPaid && c.dueDate && new Date(c.dueDate) < today)
              const hasDue = cell.dueCharges.some((c) => !c.isPaid)
              const dots: string[] = []
              if (hasOverdue) dots.push("bg-red-500")
              else if (hasDue) dots.push("bg-blue-500")
              if (cell.paidThisDay > 0) dots.push("bg-emerald-500")
              const count = cell.dueCharges.length + (cell.paidThisDay > 0 ? 1 : 0)

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelected(isSelected ? null : cell.dateKey)}
                  className={`h-16 border-b border-r border-slate-100 dark:border-slate-800 px-1 py-0.5 flex flex-col items-start hover:bg-slate-50 dark:hover:bg-slate-800/50 transition text-left relative ${
                    isSelected ? "bg-blue-50 dark:bg-blue-500/10 ring-1 ring-blue-500 ring-inset" : ""
                  }`}
                >
                  <div className={`text-[11px] font-medium ${
                    isToday
                      ? "rounded-full bg-blue-600 text-white px-1.5 py-0 inline-flex items-center justify-center min-w-[18px]"
                      : "text-slate-700 dark:text-slate-300 px-0.5"
                  }`}>
                    {cell.day}
                  </div>
                  {dots.length > 0 && (
                    <div className="flex items-center gap-0.5 mt-0.5 w-full">
                      {dots.map((c, k) => (
                        <span key={k} className={`inline-block h-1.5 w-1.5 rounded-full ${c}`} />
                      ))}
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 ml-auto font-medium">{count}</span>
                    </div>
                  )}
                  {cell.isExpectedRent && dots.length === 0 && (
                    <span className="absolute bottom-1 left-1 h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-600" title="Ожидаемая дата платежа" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Боковая панель: детали выбранного дня + легенда */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          {selCell ? (
            <>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {new Date(selCell.dateKey).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
              </h3>
              {selCell.dueCharges.length === 0 && selCell.paidThisDay === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">Нет платежей</p>
              ) : (
                <ul className="space-y-2">
                  {selCell.dueCharges.map((c) => {
                    const overdue = !c.isPaid && c.dueDate && new Date(c.dueDate) < today
                    return (
                      <li key={c.id} className="flex items-center gap-2 rounded-lg border border-slate-100 dark:border-slate-800 p-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${overdue ? "bg-red-500" : c.isPaid ? "bg-emerald-500" : "bg-blue-500"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatMoney(c.amount)}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{overdue ? "Просрочено" : c.isPaid ? "Оплачено" : "К оплате"}</p>
                        </div>
                      </li>
                    )
                  })}
                  {selCell.paidThisDay > 0 && (
                    <li className="flex items-center gap-2 rounded-lg border border-slate-100 dark:border-slate-800 p-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatMoney(selCell.paidThisDay)}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Оплата получена</p>
                      </div>
                    </li>
                  )}
                </ul>
              )}
            </>
          ) : (
            <>
              <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Обозначения</h4>
              <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-500" /> К оплате</li>
                <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-500" /> Просрочка</li>
                <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Оплачено</li>
                <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-600 ring-1 ring-blue-600" /> Сегодня</li>
              </ul>
              <p className="text-xs text-slate-400 dark:text-slate-500 pt-1">Нажмите на дату — покажем платежи этого дня.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
