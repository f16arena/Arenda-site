export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { ChatView, type ChatUser, type ChatMessage } from "@/components/messages/chat-view"
import { requireOrgAccess } from "@/lib/org"

export default async function AdminMessagesPage() {
  const session = await auth()
  if (!session?.user) redirect("/login")
  const { orgId } = await requireOrgAccess()

  const me = session.user.id

  // Только пользователи моей организации
  const others = await db.user.findMany({
    where: { isActive: true, id: { not: me }, organizationId: orgId },
    select: { id: true, name: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  })

  // Только сообщения, где обе стороны в моей организации
  const allMessages = await db.message.findMany({
    where: {
      AND: [
        { OR: [{ fromId: me }, { toId: me }] },
        {
          OR: [
            { from: { organizationId: orgId }, to: { organizationId: orgId } },
          ],
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      fromId: true,
      toId: true,
      subject: true,
      body: true,
      isRead: true,
      createdAt: true,
    },
  })

  // Группируем по собеседнику
  const messagesByContact: Record<string, ChatMessage[]> = {}
  for (const m of allMessages) {
    const otherId = m.fromId === me ? m.toId : m.fromId
    if (!messagesByContact[otherId]) messagesByContact[otherId] = []
    messagesByContact[otherId].push(m)
  }

  // Считаем непрочитанные и последнее сообщение
  const contacts: ChatUser[] = others.map((u) => {
    const conv = messagesByContact[u.id] ?? []
    const last = conv[conv.length - 1]
    const unread = conv.filter((m) => m.toId === me && !m.isRead).length
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      unread,
      lastMessage: last?.body ?? null,
      lastMessageAt: last?.createdAt ?? null,
    }
  })

  // Сортируем: с непрочитанными сверху, потом по последнему сообщению
  contacts.sort((a, b) => {
    if (a.unread !== b.unread) return b.unread - a.unread
    if (a.lastMessageAt && b.lastMessageAt) return b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
    if (a.lastMessageAt) return -1
    if (b.lastMessageAt) return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Сообщения</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">Общайтесь с арендаторами и сотрудниками</p>
      </div>
      <ChatView
        currentUserId={me}
        contacts={contacts}
        messagesByContact={messagesByContact}
        showBroadcast
      />
    </div>
  )
}
