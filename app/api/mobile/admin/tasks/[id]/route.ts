import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { mobileError } from "@/lib/mobile-context"
import { getMobileStaffRequest } from "@/lib/mobile-admin"
import { assertUserInOrg } from "@/lib/scope-guards"
import { notifyUser } from "@/lib/notify"

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

async function findTaskInScope(taskId: string, buildingIds: string[]) {
  const task = await db.task.findUnique({
    where: { id: taskId },
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
  const { id } = await params

  const existing = await findTaskInScope(id, buildingIds)
  if (!existing) return mobileError("Задача не найдена", 404)

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
    const t = String(body.title).trim()
    if (t.length < 2) return mobileError("Введите название задачи")
    data.title = t
  }
  if (body?.description !== undefined) {
    data.description = body.description ? String(body.description).trim() : null
  }
  if (body?.category !== undefined) {
    const c = String(body.category).toUpperCase()
    if (!ALLOWED_CATEGORIES.has(c)) return mobileError("Неверная категория")
    data.category = c
  }
  if (body?.priority !== undefined) {
    const p = String(body.priority).toUpperCase()
    if (!ALLOWED_PRIORITIES.has(p)) return mobileError("Неверный приоритет")
    data.priority = p
  }
  if (body?.status !== undefined) {
    const s = String(body.status).toUpperCase()
    if (!ALLOWED_STATUSES.has(s)) return mobileError("Неверный статус")
    data.status = s
  }
  if (body?.estimatedCost !== undefined) {
    if (body.estimatedCost === null) {
      data.estimatedCost = null
    } else {
      const n = Number(body.estimatedCost)
      if (!Number.isFinite(n) || n < 0) return mobileError("Неверная плановая сумма")
      data.estimatedCost = n
    }
  }
  if (body?.actualCost !== undefined) {
    if (body.actualCost === null) {
      data.actualCost = null
    } else {
      const n = Number(body.actualCost)
      if (!Number.isFinite(n) || n < 0) return mobileError("Неверная фактическая сумма")
      data.actualCost = n
    }
  }
  if (body?.dueDate !== undefined) {
    if (body.dueDate === null || body.dueDate === "") {
      data.dueDate = null
    } else {
      const d = new Date(body.dueDate)
      if (Number.isNaN(d.getTime())) return mobileError("Неверная дата")
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

  if (Object.keys(data).length === 0) return mobileError("Нечего обновлять")

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
    await notifyUser({
      userId: notifyNewAssignee,
      type: "TASK_ASSIGNED",
      title: "Назначена задача",
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

  const { buildingIds } = result
  const { id } = await params

  const existing = await findTaskInScope(id, buildingIds)
  if (!existing) return mobileError("Задача не найдена", 404)

  await db.task.delete({ where: { id: existing.id } })

  return NextResponse.json({ ok: true })
}
