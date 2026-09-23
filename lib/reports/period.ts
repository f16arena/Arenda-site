// Период отчёта на странице «Аналитика»: ?period=month|prev|quarter|year.

export type ReportPeriod = "month" | "prev" | "quarter" | "year"

// label — legacy: страница /admin/analytics берёт подписи из словаря
// (adminFinance.analytics.periods) и отсюда использует только key.
export const REPORT_PERIODS: { key: ReportPeriod; label: string }[] = [
  { key: "month", label: "Этот месяц" },
  { key: "prev", label: "Прошлый месяц" },
  { key: "quarter", label: "Квартал" },
  { key: "year", label: "Год" },
]

export function parseReportPeriod(raw: string | undefined, fallback: ReportPeriod = "year"): ReportPeriod {
  return REPORT_PERIODS.some((p) => p.key === raw) ? (raw as ReportPeriod) : fallback
}

/** Границы периода: [from, to). */
export function resolveReportRange(period: ReportPeriod, now: Date): { from: Date; to: Date } {
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (period) {
    case "prev":
      return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) }
    case "quarter": {
      const qStart = Math.floor(m / 3) * 3
      return { from: new Date(y, qStart, 1), to: new Date(y, qStart + 3, 1) }
    }
    case "year":
      return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1) }
    case "month":
    default:
      return { from: new Date(y, m, 1), to: new Date(y, m + 1, 1) }
  }
}

/**
 * «за сентябрь», «за 3 квартал», «за 2026 год» — для подписей.
 *
 * @deprecated Жёстко русская и вызовов не имеет. Переведённый вариант —
 * periodCaption в app/admin/analytics/page.tsx (словарь
 * adminFinance.analytics.captions). Новый код берёт его, а не эту функцию.
 */
export function reportPeriodCaption(period: ReportPeriod, now: Date): string {
  const { from } = resolveReportRange(period, now)
  if (period === "year") return `за ${from.getFullYear()} год`
  if (period === "quarter") return `за ${Math.floor(from.getMonth() / 3) + 1} квартал ${from.getFullYear()}`
  const month = new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(from)
  return `за ${month}`
}
