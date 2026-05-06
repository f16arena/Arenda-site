export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { ChatViewLoader } from "@/components/messages/chat-view-loader"
import type { ChatUser, ChatMessage } from "@/components/messages/chat-view"
import { getTenantAdminContactsForUser } from "@/lib/tenant-admin-contact"

const CHAT_MESSAGE_SOURCE_LIMIT = 300

export default async function CabinetMessages() {
  const session = await auth()
  if (!session?.user) redirect("/login")

  const me = session.user.id

  // Для арендатора — только администратор здания или ADMIN'ы организации.
  // OWNER намеренно не попадает в контакты арендатора.
  const staff = await getTenantAdminContactsForUser(me)
  const staffIds = staff.map((user) => user.id)

  const messageWhere = staffIds.length > 0
    ? {
        OR: [
          { fromId: me, toId: { in: staffIds } },
          { toId: me, fromId: { in: staffIds } },
        ],
      }
    : { id: "__no_admin_contacts__" }

  const [recentMessagesDesc, unreadGroups] = await Promise.all([
    db.message.findMany({
      where: messageWhere,
      orderBy: { createdAt: "desc" },
      take: CHAT_MESSAGE_SOURCE_LIMIT,
      select: {
        id: true,
        fromId: true,
        toId: true,
        subject: true,
        body: true,
        isRead: true,
        attachmentUrl: true,
        createdAt: true,
      },
    }),
    db.message.groupBy({
      by: ["fromId"],
      where: staffIds.length > 0
        ? { toId: me, fromId: { in: staffIds }, isRead: false }
        : { id: "__no_admin_contacts__" },
      _count: { _all: true },
    }),
  ])
  const allMessages = [...recentMessagesDesc].reverse()
  const unreadByContact = new Map(unreadGroups.map((group) => [group.fromId, group._count._all]))

  const messagesByContact: Record<string, ChatMessage[]> = {}
  for (const m of allMessages) {
    const otherId = m.fromId === me ? m.toId : m.fromId
    if (!messagesByContact[otherId]) messagesByContact[otherId] = []
    messagesByContact[otherId].push(m)
  }

  const contacts: ChatUser[] = staff.map((u) => {
    const conv = messagesByContact[u.id] ?? []
    const last = conv[conv.length - 1]
    const unread = unreadByContact.get(u.id) ?? 0
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      unread,
      lastMessage: last?.body ?? null,
      lastMessageAt: last?.createdAt ?? null,
    }
  })

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
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">Связь с администрацией здания</p>
      </div>
      <ChatViewLoader
        currentUserId={me}
        contacts={contacts}
        messagesByContact={messagesByContact}
      />
    </div>
  )
}
