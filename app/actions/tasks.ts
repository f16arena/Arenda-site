"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { assertTaskInOrg, assertUserInOrg } from "@/lib/scope-guards"

export async function createTask(formData: FormData) {
  const session = await auth()
  if (!session) return { error: "Не авторизован" }
  const { orgId } = await requireOrgAccess()

  const title = formData.get("title") as string
  const description = formData.get("description") as string
  const category = formData.get("category") as string
  const priority = formData.get("priority") as string
  const floorNumberStr = formData.get("floorNumber") as string
  const spaceNumber = formData.get("spaceNumber") as string
  const estimatedCostStr = formData.get("estimatedCost") as string
  const dueDateStr = formData.get("dueDate") as string
  const assignedToId = formData.get("assignedToId") as string

  if (assignedToId) {
    await assertUserInOrg(assignedToId, orgId)
  }

  await db.task.create({
    data: {
      title,
      description: description || null,
      category,
      priority,
      floorNumber: floorNumberStr ? parseInt(floorNumberStr) : null,
      spaceNumber: spaceNumber || null,
      estimatedCost: estimatedCostStr ? parseFloat(estimatedCostStr) : null,
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
  const { orgId } = await requireOrgAccess()
  await assertTaskInOrg(taskId, orgId)

  await db.task.update({ where: { id: taskId }, data: { status } })
  revalidatePath("/admin/tasks")
  return { success: true }
}

export async function deleteTask(taskId: string) {
  const { orgId } = await requireOrgAccess()
  await assertTaskInOrg(taskId, orgId)

  await db.task.delete({ where: { id: taskId } })
  revalidatePath("/admin/tasks")
}

export async function updateTask(taskId: string, formData: FormData) {
  const { orgId } = await requireOrgAccess()
  await assertTaskInOrg(taskId, orgId)

  const title = formData.get("title") as string
  const description = formData.get("description") as string
  const category = formData.get("category") as string
  const priority = formData.get("priority") as string
  const status = formData.get("status") as string
  const estimatedCostStr = formData.get("estimatedCost") as string
  const actualCostStr = formData.get("actualCost") as string
  const dueDateStr = formData.get("dueDate") as string
  const assignedToId = formData.get("assignedToId") as string

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
      estimatedCost: estimatedCostStr ? parseFloat(estimatedCostStr) : null,
      actualCost: actualCostStr ? parseFloat(actualCostStr) : null,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
      assignedToId: assignedToId || null,
    },
  })

  revalidatePath("/admin/tasks")
  return { success: true }
}
