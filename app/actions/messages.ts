"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { assertUserInOrg } from "@/lib/scope-guards"
import { notifyUser } from "@/lib/notify"

const BROADCAST_ID = "BROADCAST_ALL"

export async function sendMessage(formData: FormData) {
  const session = await auth()
  if (!session?.user) throw new Error("Не авторизован")
  const { orgId } = await requireOrgAccess()

  const toId = String(formData.get("toId") ?? "").trim()
  const body = String(formData.get("body") ?? "").trim()
  const subject = String(formData.get("subject") ?? "").trim() || null

  if (!toId) throw new Error("Не указан получатель")
  if (!body) throw new Error("Сообщение не может быть пустым")

  const senderName = session.user.name ?? "Сотрудник"
  const preview = body.length > 80 ? body.slice(0, 77) + "..." : body

  // Общий чат — рассылка только пользователям своей организации
  if (toId === BROADCAST_ID) {
    const recipients = await db.user.findMany({
      where: {
        isActive: true,
        id: { not: session.user.id },
        organizationId: orgId,
      },
      select: { id: true, role: true },
    })

    if (recipients.length === 0) throw new Error("Нет получателей")

    await db.message.createMany({
      data: recipients.map((r) => ({
        fromId: session.user.id,
        toId: r.id,
        subject: subject ?? "[Объявление]",
        body,
      })),
    })

    // Рассылка: in-app + telegram, без email (массовая рассылка
    // на email = spam-флаг от провайдеров).
    for (const r of recipients) {
      await notifyUser({
        userId: r.id,
        type: "MESSAGE_RECEIVED",
        title: subject ? `Объявление: ${subject}` : "Новое объявление",
        message: `${senderName}: ${preview}`,
        link: r.role === "TENANT" ? "/cabinet/messages" : "/admin/messages",
        sendEmail: false,
      })
    }
  } else {
    // Адресное сообщение — получатель должен быть в той же организации
    await assertUserInOrg(toId, orgId)
    await db.message.create({
      data: {
        fromId: session.user.id,
        toId,
        subject,
        body,
      },
    })

    // Личное сообщение — все каналы (in-app + telegram + email)
    const recipient = await db.user.findUnique({
      where: { id: toId },
      select: { role: true },
    })
    await notifyUser({
      userId: toId,
      type: "MESSAGE_RECEIVED",
      title: subject ? `Сообщение: ${subject}` : `Сообщение от ${senderName}`,
      message: `${senderName}: ${preview}`,
      link: recipient?.role === "TENANT" ? "/cabinet/messages" : "/admin/messages",
    })
  }

  revalidatePath("/admin/messages")
  revalidatePath("/cabinet/messages")
}

export async function markConversationRead(otherUserId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Не авторизован")

  await db.message.updateMany({
    where: {
      fromId: otherUserId,
      toId: session.user.id,
      isRead: false,
    },
    data: { isRead: true },
  })

  revalidatePath("/admin/messages")
  revalidatePath("/cabinet/messages")
}

export async function deleteMessage(messageId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Не авторизован")

  const msg = await db.message.findUnique({ where: { id: messageId }, select: { fromId: true } })
  if (!msg) throw new Error("Сообщение не найдено")
  if (msg.fromId !== session.user.id && session.user.role !== "OWNER") {
    throw new Error("Нет прав на удаление")
  }

  await db.message.delete({ where: { id: messageId } })

  revalidatePath("/admin/messages")
  revalidatePath("/cabinet/messages")
}
