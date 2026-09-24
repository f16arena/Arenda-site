import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { mobileError } from "@/lib/mobile-context"
import { getMobileStaffRequest } from "@/lib/mobile-admin"
import { assertUserInOrg } from "@/lib/scope-guards"
import { notifyUser } from "@/lib/notify"
import { taskScope } from "@/lib/tenant-scope"
import { getTForUser } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"

const ALLOWED_CATEGORIES = new Set([
  "MAINTENANCE",
  "REPAIR",
  "INSPECTION",
  "CLEANING",
  "ADMIN",
  "PLUMBING",
  "ELECTRICAL",
  "SECURITY",
  "OTHER",
])
const ALLOWED_PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"])
const ALLOWED_STATUSES = new Set(["NEW", "IN_PROGRESS", "DONE", "CLOSED", "CANCELLED"])

async function findTaskInScope(taskId: string, buildingIds: string[], orgId: string) {
  // Сначала организация: задачи без здания раньше находились по id в любой
  // организации (проверялось только здание, а оно может быть пустым).
  const task = await db.task.findFirst({
    where: { id: taskId, ...taskScope(orgId) },
    select: { id: true, buildingId: true, assignedToId: true, title: true },
  })
  if (!task) return null
  if (task.buildingId && !buildingIds.includes(task.buildingId)) return null
  return task
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const { ctx, buildingIds } = result
  // Ошибки читает админ в мобильном приложении: язык — из его профиля.
  const { t } = await getTForUser(ctx.user.id)
  const { id } = await params

  const existing = await findTaskInScope(id, buildingIds, ctx.org.id)
  if (!existing) return mobileError(t("adminDocs.api.tasks.notFound"), 404)

  const body = (await req.json().catch(() => null)) as {
    title?: string
    description?: string | null
    category?: string
    priority?: string
    status?: string
    estimatedCost?: number | null
    actualCost?: number | null
    dueDate?: string | null
    assignedToId?: string | null
  } | null

  const data: Record<string, unknown> = {}

  if (body?.title !== undefined) {
    const title = String(body.title).trim()
    if (title.length < 2) return mobileError(t("adminDocs.api.tasks.titleRequired"))
    data.title = title
  }
  if (body?.description !== undefined) {
    data.description = body.description ? String(body.description).trim() : null
  }
  if (body?.category !== undefined) {
    const c = String(body.category).toUpperCase()
    if (!ALLOWED_CATEGORIES.has(c)) return mobileError(t("adminDocs.api.tasks.badCategory"))
    data.category = c
  }
  if (body?.priority !== undefined) {
    const p = String(body.priority).toUpperCase()
    if (!ALLOWED_PRIORITIES.has(p)) return mobileError(t("adminDocs.api.tasks.badPriority"))
    data.priority = p
  }
  if (body?.status !== undefined) {
    const s = String(body.status).toUpperCase()
    if (!ALLOWED_STATUSES.has(s)) return mobileError(t("adminDocs.api.tasks.badStatus"))
    data.status = s
  }
  if (body?.estimatedCost !== undefined) {
    if (body.estimatedCost === null) {
      data.estimatedCost = null
    } else {
      const n = Number(body.estimatedCost)
      if (!Number.isFinite(n) || n < 0) return mobileError(t("adminDocs.api.tasks.badPlannedAmount"))
      data.estimatedCost = n
    }
  }
  if (body?.actualCost !== undefined) {
    if (body.actualCost === null) {
      data.actualCost = null
    } else {
      const n = Number(body.actualCost)
      if (!Number.isFinite(n) || n < 0) return mobileError(t("adminDocs.api.tasks.badActualAmount"))
      data.actualCost = n
    }
  }
  if (body?.dueDate !== undefined) {
    if (body.dueDate === null || body.dueDate === "") {
      data.dueDate = null
    } else {
      const d = new Date(body.dueDate)
      if (Number.isNaN(d.getTime())) return mobileError(t("adminDocs.api.tasks.badDate"))
      data.dueDate = d
    }
  }
  let notifyNewAssignee: string | null = null
  if (body?.assignedToId !== undefined) {
    if (body.assignedToId === null || body.assignedToId === "") {
      data.assignedToId = null
    } else {
      await assertUserInOrg(body.assignedToId, ctx.org.id)
      data.assignedToId = body.assignedToId
      if (existing.assignedToId !== body.assignedToId) notifyNewAssignee = body.assignedToId
    }
  }

  if (Object.keys(data).length === 0) return mobileError(t("adminDocs.api.common.nothingToUpdate"))

  const updated = await db.task.update({
    where: { id: existing.id },
    data,
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      priority: true,
      status: true,
      floorNumber: true,
      spaceNumber: true,
      estimatedCost: true,
      actualCost: true,
      dueDate: true,
      createdAt: true,
      updatedAt: true,
      building: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true, role: true } },
    },
  })

  if (notifyNewAssignee && notifyNewAssignee !== ctx.user.id) {
    // Заголовок уведомления — на языке исполнителя, а не того, кто назначил.
    const { t: tAssignee } = await getTForUser(notifyNewAssignee)
    await notifyUser({
      userId: notifyNewAssignee,
      type: "TASK_ASSIGNED",
      title: tAssignee("emails.messaging.taskAssignedTitle"),
      message: updated.title,
      link: "/admin/tasks",
      sendEmail: false,
      sendPush: true,
      pushData: { taskId: updated.id },
    })
  }

  return NextResponse.json({ data: updated })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const { ctx, buildingIds } = result
  const { t } = await getTForUser(ctx.user.id)
  const { id } = await params

  const existing = await findTaskInScope(id, buildingIds, ctx.org.id)
  if (!existing) return mobileError(t("adminDocs.api.tasks.notFound"), 404)

  await db.task.delete({ where: { id: existing.id } })

  return NextResponse.json({ ok: true })
}
