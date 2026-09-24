import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { mobileError } from "@/lib/mobile-context"
import { getMobileTenantRequest } from "@/lib/mobile-tenant"
import { notifyUser } from "@/lib/notify"
import { getTenantAdminContactsForUser } from "@/lib/tenant-admin-contact"
import { getTForUser } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const result = await getMobileTenantRequest(req)
  if (!result.ok) return result.response

  const messages = await db.message.findMany({
    where: {
      OR: [
        { fromId: result.ctx.user.id },
        { toId: result.ctx.user.id },
      ],
    },
    select: {
      id: true,
      subject: true,
      body: true,
      isRead: true,
      attachmentUrl: true,
      createdAt: true,
      from: { select: { id: true, name: true, role: true } },
      to: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  const admins = await getTenantAdminContactsForUser(result.ctx.user.id)

  return NextResponse.json({
    unread: messages.filter((message) => message.to.id === result.ctx.user.id && !message.isRead).length,
    admins,
    data: messages.map((message) => ({
      ...message,
      direction: message.from.id === result.ctx.user.id ? "out" : "in",
    })),
  })
}

export async function POST(req: Request) {
  const result = await getMobileTenantRequest(req)
  if (!result.ok) return result.response

  const { ctx, tenant } = result
  // Ошибки читает арендатор, а тему и уведомление — администратор: языки разные.
  const { t } = await getTForUser(ctx.user.id)
  const body = await req.json().catch(() => null) as {
    toUserId?: string
    subject?: string
    body?: string
  } | null

  const admins = await getTenantAdminContactsForUser(ctx.user.id)
  if (admins.length === 0) return mobileError(t("adminDocs.api.common.noAdminForSpace"), 409)

  const allowedAdminIds = new Set(admins.map((admin) => admin.id))
  const toUserId = String(body?.toUserId ?? admins[0].id).trim()
  if (!allowedAdminIds.has(toUserId)) return mobileError(t("adminDocs.api.common.recipientUnavailable"), 403)

  const { t: tAdmin } = await getTForUser(toUserId)
  const defaultSubject = tAdmin("emails.messaging.fromTenantSubject")
  const subject = String(body?.subject ?? defaultSubject).trim().slice(0, 160)
  const text = String(body?.body ?? "").trim().slice(0, 3000)
  if (text.length < 2) return mobileError(t("adminDocs.api.messages.textRequired"))

  const message = await db.message.create({
    data: {
      fromId: ctx.user.id,
      toId: toUserId,
      subject: subject || defaultSubject,
      body: text,
    },
    select: {
      id: true,
      subject: true,
      body: true,
      isRead: true,
      createdAt: true,
      to: { select: { id: true, name: true, role: true } },
    },
  })

  await notifyUser({
    userId: toUserId,
    type: "MESSAGE",
    title: tAdmin("emails.messaging.newMessageTitle", { tenant: tenant.companyName }),
    message: text.slice(0, 180),
    link: "/admin/messages",
    sendEmail: false,
    sendPush: true,
    pushData: {
      messageId: message.id,
      tenantId: tenant.id,
    },
  })

  return NextResponse.json({ data: message }, { status: 201 })
}
