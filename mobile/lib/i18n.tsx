/**
 * Перевод в мобильном приложении.
 *
 * Приложение — отдельная сборка и до словарей сайта не дотягивается, поэтому
 * здесь свой, маленький: те же ключи и тот же подход (русский задаёт форму,
 * казахский обязан её повторить), но без серверной части.
 *
 * Язык приходит из профиля (bootstrap → user.locale) — тот же, что в кабинете
 * на сайте. Выбор на устройстве сохраняется локально и имеет приоритет.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { readCache, writeCache } from "@/lib/cache"
import { ru } from "@/lib/i18n-ru"
import { kk } from "@/lib/i18n-kk"

export type Locale = "ru" | "kk"
export const LOCALES: Locale[] = ["ru", "kk"]
export const LOCALE_NAMES: Record<Locale, string> = { ru: "Русский", kk: "Қазақша" }
export const LOCALE_SHORT: Record<Locale, string> = { ru: "RU", kk: "ҚАЗ" }

const INTL_LOCALE: Record<Locale, string> = { ru: "ru-RU", kk: "kk-KZ" }
const LOCALE_KEY = "app-locale"

export type Messages = typeof ru
type Vars = Record<string, string | number>

const DICTIONARIES: Record<Locale, Messages> = { ru, kk }

export function isLocale(value: unknown): value is Locale {
  return value === "ru" || value === "kk"
}

function lookup(tree: unknown, key: string): unknown {
  let node = tree
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return node
}

function interpolate(template: string, vars?: Vars) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match))
}

type Ctx = {
  locale: Locale
  t: (key: string, vars?: Vars) => string
  money: (amount: number) => string
  date: (value: string | Date) => string
  setLocale: (locale: Locale) => void
  /** Язык из профиля — применяется, если на устройстве свой ещё не выбирали. */
  applyProfileLocale: (locale: string | null | undefined) => void
}

const I18nContext = createContext<Ctx | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ru")
  const [chosenOnDevice, setChosenOnDevice] = useState(false)

  useEffect(() => {
    let alive = true
    readCache<Locale>(LOCALE_KEY).then((cached) => {
      if (!alive || !isLocale(cached?.value)) return
      setLocaleState(cached.value)
      setChosenOnDevice(true)
    })
    return () => { alive = false }
  }, [])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    setChosenOnDevice(true)
    void writeCache(LOCALE_KEY, next)
  }, [])

  const applyProfileLocale = useCallback((next: string | null | undefined) => {
    if (chosenOnDevice || !isLocale(next)) return
    setLocaleState(next)
  }, [chosenOnDevice])

  const value = useMemo<Ctx>(() => {
    const dict = DICTIONARIES[locale]
    const t = (key: string, vars?: Vars) => {
      const found = lookup(dict, key) ?? lookup(ru, key)
      return typeof found === "string" ? interpolate(found, vars) : key
    }
    return {
      locale,
      t,
      money: (amount: number) =>
        new Intl.NumberFormat(INTL_LOCALE[locale], {
          style: "currency",
          currency: "KZT",
          maximumFractionDigits: 0,
        }).format(amount),
      date: (input: string | Date) =>
        new Date(input).toLocaleDateString(INTL_LOCALE[locale], {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }),
      setLocale,
      applyProfileLocale,
    }
  }, [locale, setLocale, applyProfileLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useT(): Ctx {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useT вызван вне I18nProvider")
  return ctx
}
