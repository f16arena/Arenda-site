import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { mobileError } from "@/lib/mobile-context"
import { getMobileStaffRequest, tenantInBuildingsWhere } from "@/lib/mobile-admin"
import { notifyUser } from "@/lib/notify"
import { getTForUser } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const { ctx, buildingIds } = result
  // Список читает админ в мобильном приложении: язык — из его профиля.
  const { t } = await getTForUser(ctx.user.id)

  const tenantUserIds = (
    await db.tenant.findMany({
      where: tenantInBuildingsWhere(buildingIds),
      select: { userId: true },
    })
  )
    .map((tenant) => tenant.userId)
    .filter((id): id is string => !!id)

  if (tenantUserIds.length === 0) {
    return NextResponse.json({ unread: 0, threads: [], data: [] })
  }

  const messages = await db.message.findMany({
    where: {
      OR: [
        { fromId: ctx.user.id, toId: { in: tenantUserIds } },
        { toId: ctx.user.id, fromId: { in: tenantUserIds } },
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
    take: 100,
  })

  const threadsMap = new Map<string, {
    counterpartId: string
    counterpartName: string
    tenantId: string | null
    tenantName: string | null
    lastMessageAt: Date
    lastBody: string
    unread: number
  }>()

  const counterpartTenants = await db.tenant.findMany({
    where: { userId: { in: tenantUserIds } },
    select: { id: true, companyName: true, userId: true },
  })
  // Имя  занято переводчиком — в лямбдах называем строку row.
  const tenantByUserId = new Map(
    counterpartTenants
      .filter((row) => row.userId)
      .map((row) => [row.userId as string, { id: row.id, name: row.companyName }]),
  )

  for (const msg of messages) {
    const counterpart = msg.from.id === ctx.user.id ? msg.to : msg.from
    const tenant = tenantByUserId.get(counterpart.id) ?? null
    const existing = threadsMap.get(counterpart.id)
    const isUnreadIncoming = msg.to.id === ctx.user.id && !msg.isRead

    if (!existing) {
      threadsMap.set(counterpart.id, {
        counterpartId: counterpart.id,
        counterpartName: counterpart.name ?? t("emails.messaging.tenantFallbackName"),
        tenantId: tenant?.id ?? null,
        tenantName: tenant?.name ?? null,
        lastMessageAt: msg.createdAt,
        lastBody: msg.body.slice(0, 200),
        unread: isUnreadIncoming ? 1 : 0,
      })
    } else if (isUnreadIncoming) {
      existing.unread += 1
    }
  }

  const totalUnread = messages.filter((m) => m.to.id === ctx.user.id && !m.isRead).length

  return NextResponse.json({
    unread: totalUnread,
    threads: Array.from(threadsMap.values()).sort(
      (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime(),
    ),
    data: messages.map((message) => ({
      ...message,
      direction: message.from.id === ctx.user.id ? "out" : "in",
    })),
  })
}

export async function POST(req: Request) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const { ctx, buildingIds } = result
  const { t } = await getTForUser(ctx.user.id)

  const body = (await req.json().catch(() => null)) as {
    toUserId?: string
    tenantId?: string
    subject?: string
    body?: string
  } | null

  let toUserId = body?.toUserId?.trim() ?? null
  if (!toUserId && body?.tenantId) {
    const tenant = await db.tenant.findFirst({
      where: { id: body.tenantId, ...tenantInBuildingsWhere(buildingIds) },
      select: { userId: true, companyName: true },
    })
    if (!tenant || !tenant.userId) return mobileError(t("adminDocs.api.common.tenantNoUser"), 404)
    toUserId = tenant.userId
  }

  if (!toUserId) return mobileError(t("adminDocs.api.messages.recipientRequired"))

  const tenantsInScope = await db.tenant.findMany({
    where: { userId: toUserId, ...tenantInBuildingsWhere(buildingIds) },
    select: { id: true, companyName: true },
  })
  if (tenantsInScope.length === 0) return mobileError(t("adminDocs.api.common.recipientUnavailable"), 403)
  const targetTenant = tenantsInScope[0]

  // Тему по умолчанию читает арендатор — берём её на ЕГО языке.
  const { t: tRecipient } = await getTForUser(toUserId)
  const defaultSubject = tRecipient("emails.messaging.fromAdminSubject", {
    name: ctx.user.name ?? tRecipient("emails.messaging.adminFallbackName"),
  })
  const subject = String(body?.subject ?? defaultSubject)
    .trim()
    .slice(0, 160)
  const text = String(body?.body ?? "").trim().slice(0, 3000)
  if (text.length < 2) return mobileError(t("adminDocs.api.messages.textRequired"))

  const message = await db.message.create({
    data: {
      fromId: ctx.user.id,
      toId: toUserId,
      subject,
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
    title: subject,
    message: text.slice(0, 180),
    link: "/cabinet/messages",
    sendEmail: false,
    sendPush: true,
    pushData: {
      messageId: message.id,
      tenantId: targetTenant.id,
    },
  })

  return NextResponse.json({ data: message }, { status: 201 })
}
