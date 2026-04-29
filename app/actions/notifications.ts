"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { sendTelegram } from "@/lib/telegram"
import { requireOrgAccess } from "@/lib/org"
import { assertUserInOrg } from "@/lib/scope-guards"

export async function createNotification(opts: {
  userId: string
  type: string
  title: string
  message: string
  link?: string
  sendTelegram?: boolean
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

  if (opts.sendTelegram !== false) {
    const user = await db.user.findUnique({
      where: { id: opts.userId },
      select: { telegramChatId: true },
    })
    if (user?.telegramChatId) {
      await sendTelegram(user.telegramChatId, `<b>${opts.title}</b>\n\n${opts.message}`)
    }
  }

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
