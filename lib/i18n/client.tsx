"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import { DEFAULT_LOCALE, type Locale } from "./config"
import { createTranslator, type MessageTree, type Translator } from "./translate"
import type { Messages } from "./messages"

type Ctx = { locale: Locale; messages: MessageTree }

const I18nContext = createContext<Ctx>({ locale: DEFAULT_LOCALE, messages: {} })

/**
 * Словарь для клиентских компонентов. Layout передаёт только нужные разделы
 * (pickNamespaces) — словарь админки не должен ехать в кабинет арендатора.
 */
export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale
  messages: Partial<Messages>
  children: ReactNode
}) {
  const value = useMemo(() => ({ locale, messages: messages as MessageTree }), [locale, messages])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/** const { t, tp, locale } = useT() */
export function useT(): Translator<Messages> {
  const { locale, messages } = useContext(I18nContext)
  return useMemo(() => createTranslator<Messages>(locale, messages as Messages), [locale, messages])
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale
}
