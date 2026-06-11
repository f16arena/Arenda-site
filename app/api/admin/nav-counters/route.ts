import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { complaintScope, contractScope, requestScope, taskScope } from "@/lib/tenant-scope"

export const dynamic = "force-dynamic"

/**
 * Живые счётчики для сайдбара: новые заявки, непрочитанные сообщения,
 * открытые задачи, новые жалобы, договоры на подписи. Лёгкие count-запросы
 * по индексам; фронт опрашивает раз в минуту.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }
  if (session.user.role === "TENANT") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
  }

  const { orgId } = await requireOrgAccess()
  const userId = session.user.id

  const [requests, messages, tasks, complaints, documents] = await Promise.all([
    db.request.count({
      where: { AND: [requestScope(orgId), { status: "NEW" }] },
    }).catch(() => 0),
    db.message.count({
      where: { toId: userId, isRead: false },
    }).catch(() => 0),
    db.task.count({
      where: { AND: [taskScope(orgId), { status: { in: ["NEW", "IN_PROGRESS"] } }] },
    }).catch(() => 0),
    db.complaint.count({
      where: { AND: [complaintScope(orgId), { status: "NEW" }] },
    }).catch(() => 0),
    // Договоры, отправленные на подпись и ещё не подписанные
    db.contract.count({
      where: { AND: [contractScope(orgId), { status: { in: ["SENT", "VIEWED"] } }] },
    }).catch(() => 0),
  ])

  return NextResponse.json(
    { requests, messages, tasks, complaints, documents },
    { headers: { "Cache-Control": "no-store" } },
  )
}
