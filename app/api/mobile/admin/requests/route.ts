import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { mobileError } from "@/lib/mobile-context"
import { getMobileStaffRequest, requestInBuildingsWhere, tenantInBuildingsWhere } from "@/lib/mobile-admin"
import { notifyUser } from "@/lib/notify"
import { REQUEST_STATUS_SET } from "@/lib/request-statuses"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const url = new URL(req.url)
  const status = url.searchParams.get("status")
  const priority = url.searchParams.get("priority")
  const buildingId = (url.searchParams.get("buildingId") ?? "").trim() || null
  const scopedBuildingIds = buildingId
    ? result.buildingIds.includes(buildingId) ? [buildingId] : ["__none__"]
    : result.buildingIds

  const requests = await db.request.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...requestInBuildingsWhere(scopedBuildingIds),
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
      comments: {
        select: {
          id: true,
          text: true,
          createdAt: true,
          author: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
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

const REQUEST_TYPE_SET = new Set(["TECHNICAL", "INTERNET", "CLEANING", "QUESTION", "OTHER"])
const REQUEST_PRIORITY_SET = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"])

/**
 * Создание заявки сотрудником в интересах арендатора.
 *
 * Автором (`userId`) остаётся сам сотрудник — так в истории видно, что заявку
 * завели со стороны УК, а не арендатор. Арендатор при этом выбирается явно и
 * видит заявку у себя в кабинете.
 */
export async function POST(req: Request) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const body = await req.json().catch(() => null) as {
    tenantId?: string
    title?: string
    description?: string
    type?: string
    priority?: string
  } | null

  const tenantId = String(body?.tenantId ?? "").trim()
  const title = String(body?.title ?? "").trim().slice(0, 200)
  const description = String(body?.description ?? "").trim().slice(0, 4000)
  const type = String(body?.type ?? "OTHER").trim().toUpperCase()
  const priority = String(body?.priority ?? "MEDIUM").trim().toUpperCase()

  if (!tenantId) return mobileError("Выберите арендатора")
  if (title.length < 3) return mobileError("Укажите тему заявки")
  if (description.length < 5) return mobileError("Опишите заявку подробнее")
  if (!REQUEST_TYPE_SET.has(type)) return mobileError("Некорректный тип заявки")
  if (!REQUEST_PRIORITY_SET.has(priority)) return mobileError("Некорректный приоритет")

  const tenant = await db.tenant.findFirst({
    where: { id: tenantId, ...tenantInBuildingsWhere(result.buildingIds) },
    select: { id: true, companyName: true, userId: true },
  })
  if (!tenant) return mobileError("Арендатор недоступен", 403)

  const created = await db.request.create({
    data: {
      tenantId: tenant.id,
      userId: result.ctx.user.id,
      title,
      description,
      type,
      priority,
      status: "NEW",
    },
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      priority: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (tenant.userId) {
    await notifyUser({
      userId: tenant.userId,
      type: "REQUEST_CREATED",
      title: "Создана заявка",
      message: title,
      link: "/cabinet/requests",
      sendEmail: false,
      sendPush: true,
      pushData: { requestId: created.id },
    })
  }

  return NextResponse.json({ data: created })
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
  if (!REQUEST_STATUS_SET.has(status)) return mobileError("Некорректный статус заявки")

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
