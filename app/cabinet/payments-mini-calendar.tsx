"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react"
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
 * Компактный календарь арендатора: показывает даты предстоящих оплат
 * (синие) и факт. оплат (зелёные). Просрочки — красные.
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

  const monthStart = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0).getDate()
  // Понедельник = 0
  const startWeekday = (monthStart.getDay() + 6) % 7

  // Прогноз: рекурентный платёж на paymentDueDay каждый месяц
  // (если есть незакрытые charges за конкретный период — считаем что будет долг)

  const cells: ({
    day: number
    dueCharges: ChargeRow[]   // charges с dueDate в этот день
    paidThisDay: number        // сумма платежей в этот день
    isExpectedRent: boolean   // совпадает с paymentDueDay
  } | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, month, d)
    const dayKey = date.toISOString().slice(0, 10)
    const dueCharges = charges.filter(
      (c) => c.dueDate && c.dueDate.slice(0, 10) === dayKey
    )
    const paidThisDay = payments
      .filter((p) => p.paymentDate.slice(0, 10) === dayKey)
      .reduce((s, p) => s + p.amount, 0)
    const isExpectedRent = d === paymentDueDay
    cells.push({ day: d, dueCharges, paidThisDay, isExpectedRent })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  function nav(delta: number) {
    let m = month + delta
    let y = year
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setMonth(m)
    setYear(y)
  }

  const todayDay = today.getMonth() === month && today.getFullYear() === year ? today.getDate() : -1

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          Календарь платежей
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={() => nav(-1)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300 min-w-[110px] text-center">
            {MONTHS[month]} {year}
          </span>
          <button onClick={() => nav(1)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-3">
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-[10px] font-medium text-slate-400 dark:text-slate-500 py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((cell, i) => {
            if (!cell) return <div key={i} className="aspect-square" />
            const total = cell.dueCharges.reduce((s, c) => s + c.amount, 0)
            const hasOverdue = cell.dueCharges.some((c) => !c.isPaid && c.dueDate && new Date(c.dueDate) < today)
            const hasDue = cell.dueCharges.some((c) => !c.isPaid)
            const isToday = cell.day === todayDay

            return (
              <div
                key={i}
                className={`aspect-square rounded text-center flex flex-col items-center justify-center text-[10px] relative ${
                  isToday ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-500/10"
                    : hasOverdue ? "bg-red-50 dark:bg-red-500/10"
                    : hasDue ? "bg-amber-50 dark:bg-amber-500/10"
                    : cell.paidThisDay > 0 ? "bg-emerald-50 dark:bg-emerald-500/10"
                    : cell.isExpectedRent ? "bg-slate-50 dark:bg-slate-800/50"
                    : ""
                }`}
                title={
                  cell.dueCharges.length > 0
                    ? `К оплате: ${formatMoney(total)}`
                    : cell.paidThisDay > 0
                      ? `Оплачено: ${formatMoney(cell.paidThisDay)}`
                      : cell.isExpectedRent
                        ? "Ожидаемая дата платежа"
                        : ""
                }
              >
                <span className={`font-medium ${
                  hasOverdue ? "text-red-700 dark:text-red-300"
                    : hasDue ? "text-amber-700 dark:text-amber-300"
                    : cell.paidThisDay > 0 ? "text-emerald-700 dark:text-emerald-300"
                    : "text-slate-700 dark:text-slate-300"
                }`}>
                  {cell.day}
                </span>
                {(cell.dueCharges.length > 0 || cell.paidThisDay > 0) && (
                  <span className="h-1 w-1 rounded-full bg-current absolute bottom-1" />
                )}
              </div>
            )
          })}
        </div>
        {/* Легенда */}
        <div className="mt-3 grid grid-cols-2 gap-1 text-[10px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            К оплате
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            Просрочка
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Оплачено
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-blue-500 ring-1 ring-blue-500" />
            Сегодня
          </div>
        </div>
      </div>
    </div>
  )
}
