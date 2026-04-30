"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ChevronLeft, ChevronRight, Wallet, AlertTriangle,
  Calendar as CalendarIcon, CheckSquare, X,
} from "lucide-react"

export type CalendarEventType =
  | "payment_due"
  | "payment_overdue"
  | "payment_done"
  | "contract_ending"
  | "task"

export interface CalendarEvent {
  id: string
  type: CalendarEventType
  date: string  // ISO
  title: string
  subtitle: string
  href?: string
}

const EVENT_META: Record<CalendarEventType, { color: string; icon: React.ElementType; label: string }> = {
  payment_due: { color: "bg-blue-500", icon: Wallet, label: "Платёж ожидается" },
  payment_overdue: { color: "bg-red-500", icon: AlertTriangle, label: "Просрочка" },
  payment_done: { color: "bg-emerald-500", icon: Wallet, label: "Платёж получен" },
  contract_ending: { color: "bg-amber-500", icon: CalendarIcon, label: "Договор истекает" },
  task: { color: "bg-purple-500", icon: CheckSquare, label: "Задача" },
}

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
]
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

export function CalendarView({
  currentYear, currentMonth, events,
}: {
  currentYear: number
  currentMonth: number
  events: CalendarEvent[]
}) {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [activeFilters, setActiveFilters] = useState<Set<CalendarEventType>>(
    new Set(Object.keys(EVENT_META) as CalendarEventType[])
  )

  const filteredEvents = useMemo(
    () => events.filter((e) => activeFilters.has(e.type)),
    [events, activeFilters]
  )

  // Группируем события по дате (YYYY-MM-DD)
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of filteredEvents) {
      const key = e.date.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(e)
    }
    return map
  }, [filteredEvents])

  // Строим сетку: первый день месяца, всего ячеек = N полных недель
  const firstDay = new Date(currentYear, currentMonth - 1, 1)
  const lastDay = new Date(currentYear, currentMonth, 0)
  const daysInMonth = lastDay.getDate()
  // Понедельник = 0, Воскресенье = 6
  const startWeekday = (firstDay.getDay() + 6) % 7

  const cells: (Date | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(currentYear, currentMonth - 1, d))
  }
  while (cells.length % 7 !== 0) cells.push(null)

  function navigateMonth(delta: number) {
    let newY = currentYear
    let newM = currentMonth + delta
    if (newM < 1) { newM = 12; newY-- }
    if (newM > 12) { newM = 1; newY++ }
    router.push(`?month=${newY}-${String(newM).padStart(2, "0")}`)
  }

  function toggleFilter(type: CalendarEventType) {
    const next = new Set(activeFilters)
    if (next.has(type)) next.delete(type)
    else next.add(type)
    setActiveFilters(next)
  }

  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) ?? []) : []

  return (
    <div className="space-y-4">
      {/* Header: navigation + filters */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateMonth(-1)}
              className="rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 p-2"
            >
              <ChevronLeft className="h-4 w-4 text-slate-600 dark:text-slate-400 dark:text-slate-500" />
            </button>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 min-w-[180px] text-center">
              {MONTHS[currentMonth - 1]} {currentYear}
            </h2>
            <button
              onClick={() => navigateMonth(1)}
              className="rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 p-2"
            >
              <ChevronRight className="h-4 w-4 text-slate-600 dark:text-slate-400 dark:text-slate-500" />
            </button>
          </div>
          <button
            onClick={() => router.push("?")}
            className="rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300"
          >
            Сегодня
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {(Object.entries(EVENT_META) as [CalendarEventType, typeof EVENT_META[CalendarEventType]][]).map(
            ([type, meta]) => {
              const isActive = activeFilters.has(type)
              return (
                <button
                  key={type}
                  onClick={() => toggleFilter(type)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  <span className={`inline-block h-2 w-2 rounded-full ${meta.color}`} />
                  {meta.label}
                </button>
              )
            }
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        {/* Calendar grid */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((cell, i) => {
              if (!cell) {
                return <div key={i} className="h-16 border-b border-r border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20" />
              }
              const dateKey = `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, "0")}-${String(cell.getDate()).padStart(2, "0")}`
              const dayEvents = eventsByDate.get(dateKey) ?? []
              const isToday = dateKey === todayKey
              const isSelected = dateKey === selectedDate

              // Sort: overdue first, then by type
              const sorted = [...dayEvents].sort((a, b) => {
                const order = ["payment_overdue", "contract_ending", "task", "payment_due", "payment_done"]
                return order.indexOf(a.type) - order.indexOf(b.type)
              })

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(isSelected ? null : dateKey)}
                  className={`h-16 border-b border-r border-slate-100 dark:border-slate-800 px-1 py-0.5 flex flex-col items-start hover:bg-slate-50 dark:hover:bg-slate-800/50 transition text-left relative ${
                    isSelected ? "bg-blue-50 dark:bg-blue-500/10 ring-1 ring-blue-500 ring-inset" : ""
                  }`}
                >
                  <div className={`text-[11px] font-medium ${
                    isToday
                      ? "rounded-full bg-blue-600 text-white px-1.5 py-0 inline-flex items-center justify-center min-w-[18px]"
                      : "text-slate-700 dark:text-slate-300 px-0.5"
                  }`}>
                    {cell.getDate()}
                  </div>
                  {sorted.length > 0 && (
                    <div className="flex items-center gap-0.5 mt-0.5 w-full">
                      {/* Цветные точки по уникальным типам — компактнее чем строки */}
                      {Array.from(new Set(sorted.map((e) => e.type))).slice(0, 4).map((type) => (
                        <span
                          key={type}
                          className={`inline-block h-1.5 w-1.5 rounded-full ${EVENT_META[type as keyof typeof EVENT_META].color}`}
                          title={EVENT_META[type as keyof typeof EVENT_META].label}
                        />
                      ))}
                      <span className="text-[9px] text-slate-500 dark:text-slate-400 ml-auto font-medium">
                        {sorted.length}
                      </span>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Side panel: details for selected date */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 lg:max-h-[600px] lg:overflow-y-auto">
          {selectedDate ? (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {new Date(selectedDate).toLocaleDateString("ru-RU", {
                    weekday: "long", day: "numeric", month: "long",
                  })}
                </h3>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {selectedEvents.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">Нет событий</p>
              ) : (
                <ul className="space-y-2">
                  {selectedEvents.map((e) => {
                    const meta = EVENT_META[e.type]
                    const Icon = meta.icon
                    const inner = (
                      <div className="flex items-start gap-2 rounded-lg border border-slate-100 dark:border-slate-800 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 transition">
                        <div className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded ${meta.color} text-white shrink-0`}>
                          <Icon className="h-3 w-3" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{e.title}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{e.subtitle}</p>
                        </div>
                      </div>
                    )
                    return (
                      <li key={e.id}>
                        {e.href ? <Link href={e.href}>{inner}</Link> : inner}
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <CalendarIcon className="h-8 w-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400 dark:text-slate-500">Кликни на дату чтобы увидеть события</p>
            </div>
          )}

          {/* Upcoming events list */}
          {!selectedDate && filteredEvents.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-4 mb-2 uppercase tracking-wide">
                Ближайшие события
              </h4>
              <ul className="space-y-2">
                {[...filteredEvents]
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .slice(0, 8)
                  .map((e) => {
                    const meta = EVENT_META[e.type]
                    const inner = (
                      <div className="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 transition">
                        <span className={`inline-block h-2 w-2 rounded-full ${meta.color}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{e.title}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-500">
                            {new Date(e.date).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                            {" · "}{e.subtitle}
                          </p>
                        </div>
                      </div>
                    )
                    return (
                      <li key={e.id}>
                        {e.href ? <Link href={e.href}>{inner}</Link> : inner}
                      </li>
                    )
                  })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
