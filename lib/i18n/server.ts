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

/**
 * Язык получателя письма. Письмо читает арендатор, а отправляет его владелец
 * или ночной cron — cookie запроса тут не годится, берём язык из профиля.
 */
export async function localeForUser(userId: string | null | undefined): Promise<Locale> {
  if (!userId) return DEFAULT_LOCALE
  const { db } = await import("@/lib/db")
  const user = await db.user.findUnique({ where: { id: userId }, select: { locale: true } }).catch(() => null)
  return isLocale(user?.locale) ? user.locale : DEFAULT_LOCALE
}

/** Переводчик для письма конкретному человеку. */
export async function getTForUser(userId: string | null | undefined) {
  return getT(await localeForUser(userId))
}
