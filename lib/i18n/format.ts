/**
 * Даты и деньги на языке пользователя.
 *
 * Прежние formatDate/formatPeriod из lib/utils жёстко русские (date-fns +
 * locale ru). Здесь то же самое через Intl — он знает казахские месяцы и
 * порядок: «22 сентября 2026 г.» ↔ «2026 ж. 22 қыркүйек».
 */

import { INTL_LOCALE, type Locale } from "./config"

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

/** 120 000 ₸ — одинаково в обоих языках, но через одну функцию. */
export function formatMoneyL(locale: Locale, amount: number): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: "currency",
    currency: "KZT",
    maximumFractionDigits: 0,
  }).format(amount)
}

/** 1 234 567 */
export function formatNumberL(locale: Locale, value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

/** «22 сентября 2026 г.» / «2026 ж. 22 қыркүйек» */
export function formatDateL(locale: Locale, value: Date | string): string {
  return toDate(value).toLocaleDateString(INTL_LOCALE[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

/** «22.09.2026» — в таблицах, где длинная дата не помещается. */
export function formatDateShortL(locale: Locale, value: Date | string): string {
  return toDate(value).toLocaleDateString(INTL_LOCALE[locale], {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

/**
 * Месяц начисления по строке «2026-09»: «сентябрь 2026 г.» / «2026 ж.
 * қыркүйек». Первая буква заглавная — так месяц стоит в заголовках.
 */
export function formatPeriodL(locale: Locale, period: string): string {
  const [year, month] = period.split("-").map(Number)
  const text = new Date(year, month - 1, 1).toLocaleDateString(INTL_LOCALE[locale], {
    month: "long",
    year: "numeric",
  })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Названия месяцев для календаря: «Январь…» / «Қаңтар…». */
export function monthNamesL(locale: Locale): string[] {
  const fmt = new Intl.DateTimeFormat(INTL_LOCALE[locale], { month: "long" })
  return Array.from({ length: 12 }, (_, i) => {
    const name = fmt.format(new Date(2026, i, 1))
    return name.charAt(0).toUpperCase() + name.slice(1)
  })
}

/** Дни недели с понедельника: «Пн Вт…» / «Дс Сс…». */
export function weekdayNamesL(locale: Locale): string[] {
  const fmt = new Intl.DateTimeFormat(INTL_LOCALE[locale], { weekday: "short" })
  // 21.09.2026 — понедельник.
  return Array.from({ length: 7 }, (_, i) => {
    const name = fmt.format(new Date(2026, 8, 21 + i)).replace(".", "")
    return name.charAt(0).toUpperCase() + name.slice(1)
  })
}
