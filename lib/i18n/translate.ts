/**
 * Перевод строк по ключу вида "cabinet.nav.finances".
 *
 * Общий для сервера и клиента: только чистые функции, без cookie и React.
 * Словари — обычные объекты (lib/i18n/messages), русский задаёт форму,
 * казахский обязан её повторить: пропущенный ключ — ошибка типов, а не
 * пустое место на странице.
 */

import { INTL_LOCALE, type Locale } from "./config"

/**
 * Формы множественного числа. У русского их три («1 договор», «2 договора»,
 * «5 договоров»), у казахского число с формой не согласуется («1 шарт»,
 * «5 шарт») — ему хватает one/other.
 */
export type PluralForms = {
  one: string
  few?: string
  many?: string
  other: string
}

/** Пометка «это формы числа, а не вложенный раздел словаря». */
export function plural(forms: PluralForms): PluralForms {
  return forms
}

export type Vars = Record<string, string | number>

// Словарь: разделы, строки и формы числа.
export type MessageTree = { [key: string]: string | PluralForms | MessageTree }

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never

function isPluralForms(value: unknown): value is PluralForms {
  return typeof value === "object" && value !== null && "other" in value && "one" in value
}

/** Все ключи-строки словаря: "common.save", "cabinet.nav.finances" … */
export type TextKey<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends PluralForms
      ? never
      : Join<K, TextKey<T[K]>>
}[keyof T & string]

/** Все ключи с формами числа: "cabinet.documents.count" … */
export type PluralKey<T> = {
  [K in keyof T & string]: T[K] extends string
    ? never
    : T[K] extends PluralForms
      ? K
      : Join<K, PluralKey<T[K]>>
}[keyof T & string]

function lookup(tree: MessageTree | undefined, key: string): unknown {
  let node: unknown = tree
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return node
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  )
}

function missing(key: string): string {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[i18n] нет перевода для «${key}»`)
  }
  return key
}

export interface Translator<T> {
  locale: Locale
  /** Строка по ключу; {name} в тексте подставляется из vars. */
  t: (key: TextKey<T>, vars?: Vars) => string
  /** Строка с числом: форма выбирается по правилам языка, {count} подставляется. */
  tp: (key: PluralKey<T>, count: number, vars?: Vars) => string
}

/**
 * Переводчик для словаря языка. fallback — русский словарь: если в текущем
 * языке строки нет (на клиенте, когда раздел словаря не передали), покажем
 * русскую, а не сам ключ.
 */
// T без ограничения MessageTree: рекурсивный индекс в ограничении заставляет
// компилятор разворачивать TextKey<T> бесконечно (TS2589).
export function createTranslator<T>(
  locale: Locale,
  messages: T,
  fallback?: unknown,
): Translator<T> {
  const tree = messages as MessageTree
  const backup = fallback as MessageTree | undefined
  const rules = new Intl.PluralRules(INTL_LOCALE[locale])

  const text = (key: string): string | undefined => {
    const value = lookup(tree, key) ?? lookup(backup, key)
    return typeof value === "string" ? value : undefined
  }

  const forms = (key: string): PluralForms | undefined => {
    const value = lookup(tree, key) ?? lookup(backup, key)
    return isPluralForms(value) ? value : undefined
  }

  // Реализация работает со строками; типы ключей проверяются на входе
  // (Translator<T>), внутри их не разворачиваем — иначе снова TS2589.
  const t = (key: string, vars?: Vars): string => {
    const value = text(key)
    return value === undefined ? missing(key) : interpolate(value, vars)
  }
  const tp = (key: string, count: number, vars?: Vars): string => {
    const value = forms(key)
    if (!value) return missing(key)
    const category = rules.select(count) as keyof PluralForms
    const template = value[category] ?? value.other
    return interpolate(template, { count, ...vars })
  }

  return { locale, t, tp } as unknown as Translator<T>
}
