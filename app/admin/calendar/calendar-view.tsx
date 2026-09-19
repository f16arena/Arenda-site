"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ChevronLeft, ChevronRight, Wallet, AlertTriangle,
  CheckSquare, X, FileClock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { formatMoney } from "@/lib/utils"

export type CalendarEventType =
  | "payment_due"
  | "payment_overdue"
  | "payment_done"
  | "contract_ending"
  | "task"

export interface CalendarEvent {
  id: string
  type: CalendarEventType
  /** День события «YYYY-MM-DD» по времени Казахстана (считает сервер). */
  day: string
  title: string
  subtitle: string
  amount?: number
  href?: string
}

export interface CalendarSummary {
  expected: number
  overdue: number
  received: number
  contracts: number
}

const EVENT_META: Record<CalendarEventType, { dot: string; chip: string; icon: React.ElementType; label: string }> = {
  payment_overdue: { dot: "bg-red-500", chip: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300", icon: AlertTriangle, label: "Просрочено" },
  payment_due: { dot: "bg-blue-500", chip: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300", icon: Wallet, label: "Ждём оплату" },
  payment_done: { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", icon: Wallet, label: "Оплата получена" },
  contract_ending: { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200", icon: FileClock, label: "Кончается договор" },
  task: { dot: "bg-violet-500", chip: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300", icon: CheckSquare, label: "Задача" },
}
// Порядок в клетке и в списках: сначала то, что требует действия
const ORDER: CalendarEventType[] = ["payment_overdue", "contract_ending", "task", "payment_due", "payment_done"]

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
]
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

const keyOf = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
const byOrder = (a: CalendarEvent, b: CalendarEvent) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type)
function dayLabel(day: string, opts: Intl.DateTimeFormatOptions) {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("ru-RU", opts)
}

export function CalendarView({
  currentYear, currentMonth, events, todayKey, summary,
}: {
  currentYear: number
  currentMonth: number
  events: CalendarEvent[]
  todayKey: string
  summary: CalendarSummary
}) {
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [activeFilters, setActiveFilters] = useState<Set<CalendarEventType>>(
    new Set(Object.keys(EVENT_META) as CalendarEventType[]),
  )

  const filteredEvents = useMemo(() => events.filter((e) => activeFilters.has(e.type)), [events, activeFilters])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of filteredEvents) {
      const list = map.get(e.day) ?? []
      list.push(e)
      map.set(e.day, list)
    }
    for (const list of map.values()) list.sort(byOrder)
    return map
  }, [filteredEvents])

  // Впереди: с сегодняшнего дня, по датам — то, к чему готовиться
  const upcoming = useMemo(
    () => filteredEvents.filter((e) => e.day >= todayKey && e.type !== "payment_done").sort((a, b) => a.day.localeCompare(b.day) || byOrder(a, b)).slice(0, 10),
    [filteredEvents, todayKey],
  )

  const firstDay = new Date(currentYear, currentMonth - 1, 1)
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate()
  const startWeekday = (firstDay.getDay() + 6) % 7 // Пн = 0
  const cells: (number | null)[] = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  function navigateMonth(delta: number) {
    let newY = currentYear
    let newM = currentMonth + delta
    if (newM < 1) { newM = 12; newY-- }
    if (newM > 12) { newM = 1; newY++ }
    setSelectedDate(null)
    router.push(`?month=${newY}-${String(newM).padStart(2, "0")}`)
  }

  function toggleFilter(type: CalendarEventType) {
    const next = new Set(activeFilters)
    if (next.has(type)) next.delete(type)
    else next.add(type)
    setActiveFilters(next)
  }

  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) ?? []) : []

  return (
    <div className="space-y-4">
      {/* Итог месяца — главное, ради чего открывают календарь */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile label="Ждём оплату" value={formatMoney(summary.expected)} tone="blue" />
        <SummaryTile label="Просрочено" value={formatMoney(summary.overdue)} tone={summary.overdue > 0 ? "red" : "slate"} />
        <SummaryTile label="Получено" value={formatMoney(summary.received)} tone="emerald" />
        <SummaryTile label="Кончаются договоры" value={String(summary.contracts)} tone={summary.contracts > 0 ? "amber" : "slate"} />
      </div>

      <Card className="block space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="icon-sm" onClick={() => navigateMonth(-1)} aria-label="Предыдущий месяц" title="Предыдущий месяц">
              <ChevronLeft className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            </Button>
            <h2 className="min-w-[170px] text-center text-lg font-semibold text-slate-900 dark:text-slate-100">
              {MONTHS[currentMonth - 1]} {currentYear}
            </h2>
            <Button type="button" variant="outline" size="icon-sm" onClick={() => navigateMonth(1)} aria-label="Следующий месяц" title="Следующий месяц">
              <ChevronRight className="h-4 w-4 text-slate-600 dark:text-slate-400" />
            </Button>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => { setSelectedDate(null); router.push("?") }}>
            Сегодня
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {ORDER.map((type) => {
            const meta = EVENT_META[type]
            const isActive = activeFilters.has(type)
            return (
              <button
                key={type}
                type="button"
                onClick={() => toggleFilter(type)}
                aria-pressed={isActive}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                  isActive
                    ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                    : "bg-slate-100 text-slate-400 line-through hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-500"
                }`}
              >
                <span className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} />
                {meta.label}
              </button>
            )
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="block overflow-hidden p-0">
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              if (!day) {
                return <div key={i} className="min-h-24 border-b border-r border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/20" />
              }
              const dateKey = keyOf(currentYear, currentMonth, day)
              const dayEvents = eventsByDate.get(dateKey) ?? []
              const isToday = dateKey === todayKey
              const isSelected = dateKey === selectedDate
              const isPast = dateKey < todayKey
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedDate(isSelected ? null : dateKey)}
                  className={`relative flex min-h-24 flex-col items-stretch gap-0.5 border-b border-r border-slate-100 p-1 text-left transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${
                    isSelected ? "bg-blue-50 ring-1 ring-inset ring-blue-500 dark:bg-blue-500/10" : ""
                  }`}
                >
                  <span className={`self-start text-[11px] font-medium ${
                    isToday
                      ? "inline-flex min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1.5 text-white"
                      : isPast ? "px-0.5 text-slate-400 dark:text-slate-500" : "px-0.5 text-slate-700 dark:text-slate-300"
                  }`}>
                    {day}
                  </span>
                  {/* Две первые записи — текстом, остальное счётчиком */}
                  {dayEvents.slice(0, 2).map((e) => (
                    <span key={e.id} className={`truncate rounded px-1 py-px text-[10px] font-medium ${EVENT_META[e.type].chip}`}>
                      {e.title}
                    </span>
                  ))}
                  {dayEvents.length > 2 && (
                    <span className="px-1 text-[10px] font-medium text-slate-500 dark:text-slate-400">ещё {dayEvents.length - 2}</span>
                  )}
                </button>
              )
            })}
          </div>
        </Card>

        <Card className="block space-y-3 p-4 lg:max-h-[640px] lg:overflow-y-auto">
          {selectedDate ? (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold capitalize text-slate-900 dark:text-slate-100">
                  {dayLabel(selectedDate, { weekday: "long", day: "numeric", month: "long" })}
                </h3>
                <button type="button" onClick={() => setSelectedDate(null)} aria-label="Закрыть выбранную дату" title="Закрыть" className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {selectedEvents.length === 0
                ? <p className="text-sm text-slate-400 dark:text-slate-500">В этот день ничего нет.</p>
                : <EventList events={selectedEvents} />}
            </>
          ) : (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">Впереди</h3>
              {upcoming.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500">До конца месяца ничего не запланировано.</p>
              ) : (
                <EventList events={upcoming} showDate />
              )}
              <p className="pt-1 text-[11px] text-slate-400 dark:text-slate-500">Нажмите на день в календаре, чтобы увидеть всё, что в нём.</p>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

function EventList({ events, showDate = false }: { events: CalendarEvent[]; showDate?: boolean }) {
  return (
    <ul className="space-y-2">
      {events.map((e) => {
        const meta = EVENT_META[e.type]
        const Icon = meta.icon
        const inner = (
          <div className="flex items-start gap-2 rounded-lg border border-slate-100 p-2 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
            <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded ${meta.chip}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{e.title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {showDate && <>{dayLabel(e.day, { day: "numeric", month: "short" })} · </>}
                {e.subtitle}
              </p>
            </div>
          </div>
        )
        return <li key={e.id}>{e.href ? <Link href={e.href}>{inner}</Link> : inner}</li>
      })}
    </ul>
  )
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone: "blue" | "red" | "emerald" | "amber" | "slate" }) {
  const color = {
    blue: "text-blue-600 dark:text-blue-400",
    red: "text-red-600 dark:text-red-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    slate: "text-slate-900 dark:text-slate-100",
  }[tone]
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className={`truncate text-xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{label} в этом месяце</p>
    </div>
  )
}
