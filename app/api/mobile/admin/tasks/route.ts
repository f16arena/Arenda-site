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

export async function GET(req: Request) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const { buildingIds } = result
  const url = new URL(req.url)
  const status = url.searchParams.get("status")?.trim()
  const priority = url.searchParams.get("priority")?.trim()
  const buildingId = url.searchParams.get("buildingId")?.trim()
  const assignedToMe = url.searchParams.get("assignedToMe") === "1"

  const where: Record<string, unknown> = {}
  if (buildingIds.length === 0) {
    where.buildingId = "__none__"
  } else if (buildingId) {
    if (!buildingIds.includes(buildingId)) return mobileError("Здание недоступно", 403)
    where.buildingId = buildingId
  } else {
    where.buildingId = { in: buildingIds }
  }
  if (status && ALLOWED_STATUSES.has(status)) where.status = status
  if (priority && ALLOWED_PRIORITIES.has(priority)) where.priority = priority
  if (assignedToMe) where.assignedToId = result.ctx.user.id

  const [tasks, counters] = await Promise.all([
    db.task.findMany({
      where,
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
        createdBy: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true, role: true } },
      },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
    db.task.groupBy({
      by: ["status"],
      where: {
        buildingId: buildingIds.length > 0 ? { in: buildingIds } : "__none__",
      },
      _count: { _all: true },
    }),
  ])

  const byStatus: Record<string, number> = {}
  for (const row of counters) byStatus[row.status] = row._count._all

  return NextResponse.json({
    counters: {
      total: tasks.length,
      open: tasks.filter((t) => !["DONE", "CLOSED", "CANCELLED"].includes(t.status)).length,
      urgent: tasks.filter((t) => ["HIGH", "URGENT"].includes(t.priority) && !["DONE", "CLOSED", "CANCELLED"].includes(t.status)).length,
      byStatus,
    },
    data: tasks,
  })
}

export async function POST(req: Request) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const { ctx, buildingIds } = result

  const body = (await req.json().catch(() => null)) as {
    buildingId?: string
    title?: string
    description?: string
    category?: string
    priority?: string
    floorNumber?: number
    spaceNumber?: string
    estimatedCost?: number
    dueDate?: string
    assignedToId?: string
  } | null

  const title = String(body?.title ?? "").trim()
  const description = String(body?.description ?? "").trim()
  const category = String(body?.category ?? "OTHER").toUpperCase()
  const priority = String(body?.priority ?? "MEDIUM").toUpperCase()
  const assignedToId = body?.assignedToId?.trim() || null
  const spaceNumber = String(body?.spaceNumber ?? "").trim()

  if (title.length < 2) return mobileError("Введите название задачи")
  if (!ALLOWED_CATEGORIES.has(category)) return mobileError("Неверная категория")
  if (!ALLOWED_PRIORITIES.has(priority)) return mobileError("Неверный приоритет")
  if (spaceNumber.length > 50) return mobileError("Слишком длинный номер помещения")

  let floorNumber: number | null = null
  if (body?.floorNumber !== undefined && body.floorNumber !== null) {
    const n = Number(body.floorNumber)
    if (!Number.isFinite(n) || n < -10 || n > 200) {
      return mobileError("Этаж должен быть числом от -10 до 200")
    }
    floorNumber = Math.trunc(n)
  }

  let estimatedCost: number | null = null
  if (body?.estimatedCost !== undefined && body.estimatedCost !== null) {
    const n = Number(body.estimatedCost)
    if (!Number.isFinite(n) || n < 0) return mobileError("Неверная сумма")
    estimatedCost = n
  }

  let buildingId: string | null = null
  if (body?.buildingId) {
    if (!buildingIds.includes(body.buildingId)) return mobileError("Здание недоступно", 403)
    buildingId = body.buildingId
  } else if (buildingIds.length === 1) {
    buildingId = buildingIds[0]
  }

  if (assignedToId) {
    await assertUserInOrg(assignedToId, ctx.org.id)
  }

  let dueDate: Date | null = null
  if (body?.dueDate) {
    const d = new Date(body.dueDate)
    if (Number.isNaN(d.getTime())) return mobileError("Неверная дата")
    dueDate = d
  }

  const task = await db.task.create({
    data: {
      buildingId,
      title,
      description: description || null,
      category,
      priority,
      floorNumber,
      spaceNumber: spaceNumber || null,
      estimatedCost,
      dueDate,
      assignedToId,
      createdById: ctx.user.id,
      status: "NEW",
    },
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
      createdBy: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true, role: true } },
    },
  })

  if (assignedToId && assignedToId !== ctx.user.id) {
    await notifyUser({
      userId: assignedToId,
      type: "TASK_ASSIGNED",
      title: "Назначена задача",
      message: title,
      link: "/admin/tasks",
      sendEmail: false,
      sendPush: true,
      pushData: { taskId: task.id },
    })
  }

  return NextResponse.json({ data: task }, { status: 201 })
}
