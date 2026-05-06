"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath, revalidateTag } from "next/cache"
import { sendTelegram } from "@/lib/telegram"
import { sendSms } from "@/lib/sms"
import { requireOrgAccess } from "@/lib/org"
import { assertUserInOrg } from "@/lib/scope-guards"
import { ADMIN_NOTIFICATION_CACHE_TAG } from "@/lib/admin-shell-cache"

export async function createNotification(opts: {
  userId: string
  type: string
  title: string
  message: string
  link?: string
  sendTelegram?: boolean
  sendSms?: boolean   // явный triple для срочных уведомлений (платёж, расторжение)
}) {
  // Уведомления может создавать как server-action (вызов от admin)
  // так и серверный код (cron). Если есть сессия — проверяем org-scope.
  const session = await auth()
  if (session?.user) {
    const { orgId } = await requireOrgAccess()
    await assertUserInOrg(opts.userId, orgId)
  }

  const created = await db.notification.create({
    data: {
      userId: opts.userId,
      type: opts.type,
      title: opts.title,
      message: opts.message,
      link: opts.link ?? null,
    },
  })

  // Загрузим каналы пользователя один раз
  const user = await db.user.findUnique({
    where: { id: opts.userId },
    select: {
      telegramChatId: true,
      phone: true,
      notifyTelegram: true,
      notifySms: true,
      notifyMutedTypes: true,
    },
  })
  if (!user) return created

  // Если тип уведомления заглушён — пропускаем все каналы кроме in-app
  const muted = user.notifyMutedTypes as Record<string, boolean> | null
  const isMuted = muted && muted[opts.type] === false

  if (!isMuted) {
    if (opts.sendTelegram !== false && user.notifyTelegram && user.telegramChatId) {
      await sendTelegram(user.telegramChatId, `<b>${opts.title}</b>\n\n${opts.message}`).catch(() => {})
    }
    if (opts.sendSms && user.notifySms && user.phone) {
      // SMS — короткий формат: "Title: message ссылка"
      const linkPart = opts.link
        ? ` ${process.env.ROOT_HOST ? `https://${process.env.ROOT_HOST}` : ""}${opts.link}`
        : ""
      const text = `${opts.title}: ${opts.message}${linkPart}`.slice(0, 320)
      await sendSms(user.phone, text).catch(() => {})
    }
  }

  revalidateTag(ADMIN_NOTIFICATION_CACHE_TAG, { expire: 0 })
  return created
}

export async function markNotificationRead(notificationId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Не авторизован")

  // Только своё уведомление
  await db.notification.updateMany({
    where: { id: notificationId, userId: session.user.id },
    data: { isRead: true },
  })

  revalidateTag(ADMIN_NOTIFICATION_CACHE_TAG, { expire: 0 })
  revalidatePath("/admin")
  revalidatePath("/cabinet")
}

export async function markAllRead() {
  const session = await auth()
  if (!session?.user) throw new Error("Не авторизован")

  await db.notification.updateMany({
    where: { userId: session.user.id, isRead: false },
    data: { isRead: true },
  })

  revalidateTag(ADMIN_NOTIFICATION_CACHE_TAG, { expire: 0 })
  revalidatePath("/admin")
  revalidatePath("/cabinet")
}

export async function deleteNotification(notificationId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Не авторизован")

  // Только своё уведомление
  await db.notification.deleteMany({
    where: { id: notificationId, userId: session.user.id },
  })
  revalidateTag(ADMIN_NOTIFICATION_CACHE_TAG, { expire: 0 })
  revalidatePath("/admin")
  revalidatePath("/cabinet")
}

export async function setMyTelegramChatId(chatId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Не авторизован")

  await db.user.update({
    where: { id: session.user.id },
    data: { telegramChatId: chatId.trim() || null },
  })

  revalidatePath("/admin/profile")
  revalidatePath("/cabinet/profile")
}

/**
 * Сгенерировать deep-link на бот для авто-привязки текущего пользователя.
 * Возвращает URL вида https://t.me/CommrentBot?start=<token>.
 * Токен живёт 10 минут.
 */
export async function generateTelegramConnectLink(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }

  const botName = process.env.TELEGRAM_BOT_NAME ?? process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME
  if (!botName) {
    return { ok: false, error: "Бот не настроен. Свяжитесь с администратором платформы." }
  }

  const { randomBytes } = await import("crypto")
  const token = randomBytes(24).toString("hex")
  const expiresAt = new Date(Date.now() + 10 * 60_000) // 10 минут

  await db.verificationToken.create({
    data: {
      userId: session.user.id,
      type: "TELEGRAM_CONNECT",
      target: "telegram",
      token,
      expiresAt,
    },
  })

  return {
    ok: true,
    url: `https://t.me/${botName}?start=${token}`,
  }
}

/**
 * Отвязать Telegram от текущего аккаунта.
 */
export async function disconnectTelegram() {
  const session = await auth()
  if (!session?.user) throw new Error("Не авторизован")

  await db.user.update({
    where: { id: session.user.id },
    data: { telegramChatId: null },
  })

  revalidatePath("/admin/profile")
  revalidatePath("/cabinet/profile")
}
