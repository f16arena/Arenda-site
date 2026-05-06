"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { getCurrentBuildingId } from "@/lib/current-building"
import { assertTaskInOrg, assertUserInOrg, assertBuildingInOrg } from "@/lib/scope-guards"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { assertBuildingAccess } from "@/lib/building-access"

const ALLOWED_CATEGORIES = ["MAINTENANCE", "REPAIR", "INSPECTION", "CLEANING", "ADMIN", "PLUMBING", "ELECTRICAL", "SECURITY", "OTHER"]
const ALLOWED_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"]

export async function createTask(formData: FormData) {
  await requireCapabilityAndFeature("tasks.manage")
  const session = await auth()
  if (!session) return { error: "Не авторизован" }
  const { orgId } = await requireOrgAccess()

  // Привязываем задачу к текущему зданию (если выбрано) — это даёт нам
  // org-scope для задачи. Если здания нет — задача создаётся без привязки.
  const selectedBuildingId = String(formData.get("buildingId") ?? "").trim()
  const buildingId = (await getCurrentBuildingId().catch(() => null)) ?? selectedBuildingId
  if (buildingId) {
    await assertBuildingInOrg(buildingId, orgId)
    await assertBuildingAccess(buildingId, orgId)
  }

  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const category = String(formData.get("category") ?? "OTHER")
  const priority = String(formData.get("priority") ?? "MEDIUM")
  const floorNumberStr = String(formData.get("floorNumber") ?? "").trim()
  const spaceNumber = String(formData.get("spaceNumber") ?? "").trim()
  const estimatedCostStr = String(formData.get("estimatedCost") ?? "").trim()
  const dueDateStr = String(formData.get("dueDate") ?? "").trim()
  const assignedToId = String(formData.get("assignedToId") ?? "").trim()

  if (!title || title.length < 2) return { error: "Введите название задачи" }
  if (!ALLOWED_CATEGORIES.includes(category)) return { error: "Неверная категория" }
  if (!ALLOWED_PRIORITIES.includes(priority)) return { error: "Неверный приоритет" }

  // Валидация floorNumber: только число, ограниченный диапазон.
  // Нужен для UI-фильтра, не для БД-связи.
  let floorNumber: number | null = null
  if (floorNumberStr) {
    const n = parseInt(floorNumberStr, 10)
    if (!isFinite(n) || n < -10 || n > 200) return { error: "Этаж должен быть числом от -10 до 200" }
    floorNumber = n
  }

  // spaceNumber — короткая строка (без HTML/спецсимволов в опасном виде)
  if (spaceNumber.length > 50) return { error: "Слишком длинный номер помещения" }

  // estimatedCost — число
  let estimatedCost: number | null = null
  if (estimatedCostStr) {
    const n = parseFloat(estimatedCostStr.replace(",", "."))
    if (!isFinite(n) || n < 0) return { error: "Неверная сумма" }
    estimatedCost = n
  }

  if (assignedToId) {
    await assertUserInOrg(assignedToId, orgId)
  }

  await db.task.create({
    data: {
      buildingId: buildingId ?? null,
      title,
      description: description || null,
      category,
      priority,
      floorNumber,
      spaceNumber: spaceNumber || null,
      estimatedCost,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
      assignedToId: assignedToId || null,
      createdById: session.user.id,
      status: "NEW",
    },
  })

  revalidatePath("/admin/tasks")
  return { success: true }
}

export async function updateTaskStatus(taskId: string, status: string) {
  await requireCapabilityAndFeature("tasks.manage")
  const { orgId } = await requireOrgAccess()
  await assertTaskInOrg(taskId, orgId)

  await db.task.update({ where: { id: taskId }, data: { status } })
  revalidatePath("/admin/tasks")
  return { success: true }
}

export async function deleteTask(taskId: string) {
  await requireCapabilityAndFeature("tasks.manage")
  const { orgId } = await requireOrgAccess()
  await assertTaskInOrg(taskId, orgId)

  await db.task.delete({ where: { id: taskId } })
  revalidatePath("/admin/tasks")
}

export async function updateTask(taskId: string, formData: FormData) {
  await requireCapabilityAndFeature("tasks.manage")
  const { orgId } = await requireOrgAccess()
  await assertTaskInOrg(taskId, orgId)

  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const category = String(formData.get("category") ?? "OTHER")
  const priority = String(formData.get("priority") ?? "MEDIUM")
  const status = String(formData.get("status") ?? "NEW")
  const estimatedCostStr = String(formData.get("estimatedCost") ?? "").trim()
  const actualCostStr = String(formData.get("actualCost") ?? "").trim()
  const dueDateStr = String(formData.get("dueDate") ?? "").trim()
  const assignedToId = String(formData.get("assignedToId") ?? "").trim()

  if (!title || title.length < 2) return { error: "Введите название задачи" }
  if (!ALLOWED_CATEGORIES.includes(category)) return { error: "Неверная категория" }
  if (!ALLOWED_PRIORITIES.includes(priority)) return { error: "Неверный приоритет" }

  let estimatedCost: number | null = null
  if (estimatedCostStr) {
    const n = parseFloat(estimatedCostStr.replace(",", "."))
    if (!isFinite(n) || n < 0) return { error: "Неверная плановая сумма" }
    estimatedCost = n
  }
  let actualCost: number | null = null
  if (actualCostStr) {
    const n = parseFloat(actualCostStr.replace(",", "."))
    if (!isFinite(n) || n < 0) return { error: "Неверная фактическая сумма" }
    actualCost = n
  }

  if (assignedToId) {
    await assertUserInOrg(assignedToId, orgId)
  }

  await db.task.update({
    where: { id: taskId },
    data: {
      title,
      description: description || null,
      category,
      priority,
      status,
      estimatedCost,
      actualCost,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
      assignedToId: assignedToId || null,
    },
  })

  revalidatePath("/admin/tasks")
  return { success: true }
}
