import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { mobileError } from "@/lib/mobile-context"
import { getMobileStaffRequest, requestInBuildingsWhere } from "@/lib/mobile-admin"
import { notifyUser } from "@/lib/notify"

export const dynamic = "force-dynamic"

const REQUEST_STATUSES = new Set(["NEW", "OPEN", "IN_PROGRESS", "DONE", "CLOSED", "POSTPONED", "CANCELLED"])

export async function GET(req: Request) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const url = new URL(req.url)
  const status = url.searchParams.get("status")
  const priority = url.searchParams.get("priority")

  const requests = await db.request.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...requestInBuildingsWhere(result.buildingIds),
    },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      priority: true,
      status: true,
      assigneeId: true,
      createdAt: true,
      updatedAt: true,
      tenant: {
        select: {
          id: true,
          companyName: true,
          userId: true,
          space: { select: { number: true, floor: { select: { name: true, building: { select: { id: true, name: true } } } } } },
          tenantSpaces: {
            take: 1,
            select: { space: { select: { number: true, floor: { select: { name: true, building: { select: { id: true, name: true } } } } } } },
          },
        },
      },
      _count: { select: { comments: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  })

  return NextResponse.json({
    data: requests,
    counters: {
      total: requests.length,
      open: requests.filter((request) => !["DONE", "CLOSED", "CANCELLED"].includes(request.status)).length,
      urgent: requests.filter((request) => ["HIGH", "URGENT"].includes(request.priority) && !["DONE", "CLOSED", "CANCELLED"].includes(request.status)).length,
      done: requests.filter((request) => ["DONE", "CLOSED"].includes(request.status)).length,
    },
  })
}

export async function PATCH(req: Request) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const body = await req.json().catch(() => null) as {
    requestId?: string
    status?: string
    comment?: string
  } | null

  const requestId = String(body?.requestId ?? "").trim()
  const status = String(body?.status ?? "").trim().toUpperCase()
  const comment = String(body?.comment ?? "").trim().slice(0, 1000)

  if (!requestId) return mobileError("requestId is required")
  if (!REQUEST_STATUSES.has(status)) return mobileError("Некорректный статус заявки")

  const existing = await db.request.findFirst({
    where: { id: requestId, ...requestInBuildingsWhere(result.buildingIds) },
    select: {
      id: true,
      title: true,
      status: true,
      tenant: { select: { id: true, companyName: true, userId: true } },
    },
  })
  if (!existing) return mobileError("Заявка не найдена или нет доступа", 404)

  const updated = await db.request.update({
    where: { id: existing.id },
    data: { status },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      type: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (comment) {
    await db.requestComment.create({
      data: {
        requestId: existing.id,
        authorId: result.ctx.user.id,
        text: comment,
      },
    })
  }

  if (existing.status !== status) {
    await notifyUser({
      userId: existing.tenant.userId,
      type: "REQUEST_STATUS_CHANGED",
      title: "Статус заявки изменен",
      message: `${existing.title}: ${status}`,
      link: "/cabinet/requests",
      sendEmail: false,
      sendPush: true,
      pushData: {
        requestId: existing.id,
        status,
      },
    })
  }

  return NextResponse.json({ data: updated })
}
