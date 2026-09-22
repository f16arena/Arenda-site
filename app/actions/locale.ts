"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth, SHARED_COOKIE_DOMAIN } from "@/auth"
import { db } from "@/lib/db"
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale, type Locale } from "@/lib/i18n/config"

/**
 * Сменить язык интерфейса. Cookie — чтобы следующая страница уже была на
 * новом языке; users.locale — чтобы выбор не потерялся на другом устройстве.
 * Работает и без входа (лендинг, страница входа): тогда только cookie.
 */
export async function setLocale(locale: Locale): Promise<{ ok: boolean }> {
  if (!isLocale(locale)) return { ok: false }

  ;(await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
    // Общий домен с сессией: язык, выбранный на commrent.kz/login, должен
    // остаться и на поддомене организации (bcf16.commrent.kz).
    ...(SHARED_COOKIE_DOMAIN ? { domain: SHARED_COOKIE_DOMAIN } : {}),
  })

  const session = await auth()
  if (session?.user?.id) {
    await db.user.update({ where: { id: session.user.id }, data: { locale } }).catch(() => null)
  }

  // Серверные компоненты уже отрисованы на старом языке — перерисовать.
  revalidatePath("/", "layout")
  return { ok: true }
}
