"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

const BROADCAST_ID = "BROADCAST_ALL"

export async function sendMessage(formData: FormData) {
  const session = await auth()
  if (!session?.user) throw new Error("Не авторизован")

  const toId = String(formData.get("toId") ?? "").trim()
  const body = String(formData.get("body") ?? "").trim()
  const subject = String(formData.get("subject") ?? "").trim() || null

  if (!toId) throw new Error("Не указан получатель")
  if (!body) throw new Error("Сообщение не может быть пустым")

  // Общий чат — отправить всем активным пользователям (кроме себя)
  if (toId === BROADCAST_ID) {
    const recipients = await db.user.findMany({
      where: { isActive: true, id: { not: session.user.id } },
      select: { id: true },
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
  } else {
    await db.message.create({
      data: {
        fromId: session.user.id,
        toId,
        subject,
        body,
      },
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

  // Только отправитель может удалить своё сообщение
  const msg = await db.message.findUnique({ where: { id: messageId }, select: { fromId: true } })
  if (!msg) throw new Error("Сообщение не найдено")
  if (msg.fromId !== session.user.id && session.user.role !== "OWNER") {
    throw new Error("Нет прав на удаление")
  }

  await db.message.delete({ where: { id: messageId } })

  revalidatePath("/admin/messages")
  revalidatePath("/cabinet/messages")
}
