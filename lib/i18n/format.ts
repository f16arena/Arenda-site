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
