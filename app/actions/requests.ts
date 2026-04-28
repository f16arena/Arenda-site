"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

export async function createRequestAdmin(formData: FormData) {
  const session = await auth()
  if (!session) return { error: "Не авторизован" }

  const tenantId = formData.get("tenantId") as string
  const title = formData.get("title") as string
  const description = formData.get("description") as string
  const type = formData.get("type") as string
  const priority = formData.get("priority") as string

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { userId: true },
  })
  if (!tenant) return { error: "Арендатор не найден" }

  await db.request.create({
    data: {
      tenantId,
      userId: tenant.userId,
      title,
      description,
      type,
      priority,
      status: "NEW",
    },
  })

  revalidatePath("/admin/requests")
  return { success: true }
}

export async function updateRequestStatus(requestId: string, status: string, assigneeId?: string) {
  await db.request.update({
    where: { id: requestId },
    data: {
      status,
      ...(assigneeId !== undefined ? { assigneeId: assigneeId || null } : {}),
    },
  })

  revalidatePath("/admin/requests")
  return { success: true }
}

export async function addRequestComment(requestId: string, formData: FormData) {
  const session = await auth()
  if (!session) return { error: "Не авторизован" }

  const text = formData.get("text") as string

  await db.requestComment.create({
    data: {
      requestId,
      authorId: session.user.id,
      text,
    },
  })

  revalidatePath(`/admin/requests/${requestId}`)
  return { success: true }
}

export async function deleteRequest(requestId: string) {
  await db.request.delete({ where: { id: requestId } })
  revalidatePath("/admin/requests")
}

export async function createRequestTenant(formData: FormData) {
  const session = await auth()
  if (!session) return { error: "Не авторизован" }

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
  })
  if (!tenant) return { error: "Арендатор не найден" }

  const title = formData.get("title") as string
  const description = formData.get("description") as string
  const type = formData.get("type") as string
  const priority = formData.get("priority") as string

  await db.request.create({
    data: {
      tenantId: tenant.id,
      userId: session.user.id,
      title,
      description,
      type: type || "OTHER",
      priority: priority || "MEDIUM",
      status: "NEW",
    },
  })

  revalidatePath("/cabinet/requests")
  return { success: true }
}
