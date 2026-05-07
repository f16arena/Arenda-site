import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileContext, mobileError } from "@/lib/mobile-context"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const url = new URL(req.url)
  const unreadOnly = url.searchParams.get("unread") === "1"

  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: {
        userId: result.ctx.user.id,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      select: {
        id: true,
        type: true,
        title: true,
        message: true,
        link: true,
        isRead: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    db.notification.count({
      where: {
        userId: result.ctx.user.id,
        isRead: false,
      },
    }),
  ])

  return NextResponse.json({ data: notifications, unreadCount })
}

export async function PATCH(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result.response

  const body = await req.json().catch(() => null) as {
    ids?: string[]
    markAllRead?: boolean
    isRead?: boolean
  } | null

  const isRead = body?.isRead !== false

  if (body?.markAllRead) {
    await db.notification.updateMany({
      where: { userId: result.ctx.user.id },
      data: { isRead },
    })
    return NextResponse.json({ ok: true })
  }

  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, 100)
    : []

  if (ids.length === 0) return mobileError("Notification ids are required")

  await db.notification.updateMany({
    where: {
      id: { in: ids },
      userId: result.ctx.user.id,
    },
    data: { isRead },
  })

  return NextResponse.json({ ok: true })
}
