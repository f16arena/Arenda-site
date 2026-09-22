import "server-only"

import { cookies } from "next/headers"
import { auth } from "@/auth"
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config"
import { createTranslator } from "./translate"
import { dictionaries, ru, type Messages } from "./messages"

/**
 * Язык запроса: cookie (последний выбор на этом устройстве) → язык из профиля
 * (он в сессии, в базу не ходим) → русский.
 */
export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value
  if (isLocale(value)) return value
  const fromProfile = (await auth())?.user?.locale
  return isLocale(fromProfile) ? fromProfile : DEFAULT_LOCALE
}

/** Переводчик для серверного компонента: const { t } = await getT() */
export async function getT(locale?: Locale) {
  const current = locale ?? (await getLocale())
  return createTranslator<Messages>(current, dictionaries[current], ru)
}
