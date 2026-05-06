"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { assertTenantInOrg, assertRequestInOrg } from "@/lib/scope-guards"
import { notifyUser } from "@/lib/notify"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { getTenantAdminContactsForUser } from "@/lib/tenant-admin-contact"
import {
  REQUEST_ATTACHMENT_ALLOWED_MIME_TYPES,
  REQUEST_ATTACHMENT_MAX_BYTES,
  getTenantStorageScope,
  storeBufferFile,
} from "@/lib/storage"

export async function createRequestAdmin(formData: FormData) {
  await requireCapabilityAndFeature("requests.manage")
  const { orgId } = await requireOrgAccess()

  const tenantId = formData.get("tenantId") as string
  await assertTenantInOrg(tenantId, orgId)

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
  await requireCapabilityAndFeature("requests.manage")
  const { orgId } = await requireOrgAccess()
  await assertRequestInOrg(requestId, orgId)

  const before = await db.request.findUnique({
    where: { id: requestId },
    select: { status: true, title: true, userId: true },
  })

  await db.request.update({
    where: { id: requestId },
    data: {
      status,
      ...(assigneeId !== undefined ? { assigneeId: assigneeId || null } : {}),
    },
  })

  // Уведомляем арендатора при изменении статуса (если статус действительно поменялся)
  if (before && before.status !== status && before.userId) {
    const statusLabel: Record<string, string> = {
      NEW: "Новая",
      IN_PROGRESS: "В работе",
      WAITING: "Ожидает",
      RESOLVED: "Решена",
      CLOSED: "Закрыта",
    }
    await notifyUser({
      userId: before.userId,
      type: "REQUEST_STATUS_CHANGED",
      title: `Заявка обновлена: ${before.title}`,
      message: `Статус: ${statusLabel[status] ?? status}`,
      link: `/cabinet/requests`,
      sendEmail: status === "RESOLVED" || status === "CLOSED",
    })
  }

  revalidatePath("/admin/requests")
  return { success: true }
}

export async function addRequestComment(requestId: string, formData: FormData) {
  await requireCapabilityAndFeature("requests.manage")
  const session = await auth()
  if (!session) return { error: "Не авторизован" }

  const { orgId } = await requireOrgAccess()
  await assertRequestInOrg(requestId, orgId)

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
  await requireCapabilityAndFeature("requests.manage")
  const { orgId } = await requireOrgAccess()
  await assertRequestInOrg(requestId, orgId)

  await db.request.delete({ where: { id: requestId } })
  revalidatePath("/admin/requests")
}

// Tenant-side: создаёт заявку от своего имени. Не требует org-scope guard,
// так как мы строго берём tenant по userId сессии.
export async function createRequestTenant(formData: FormData) {
  const session = await auth()
  if (!session) return { error: "Не авторизован" }
  const organizationId = session.user.organizationId
  if (!organizationId) return { error: "Организация не найдена" }

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    include: {
      space: { select: { number: true, floor: { select: { building: { select: { organizationId: true } } } } } },
      fullFloors: { select: { building: { select: { organizationId: true } } }, take: 1 },
    },
  })
  if (!tenant) return { error: "Арендатор не найден" }

  const title = formData.get("title") as string
  const description = formData.get("description") as string
  const type = formData.get("type") as string
  const priority = formData.get("priority") as string
  const attachment = await parseRequestAttachment(formData.get("attachment"))
  if (attachment && "error" in attachment) return { error: attachment.error }

  const created = await db.request.create({
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

  let storedAttachment: { id: string; url: string; fileName: string } | null = null
  try {
    if (attachment && !("error" in attachment)) {
      const storageScope = await getTenantStorageScope(tenant.id)
      storedAttachment = await storeBufferFile({
        organizationId,
        fileName: attachment.name,
        mimeType: attachment.mime,
        bytes: attachment.buffer,
        ownerType: "REQUEST_ATTACHMENT",
        ownerId: created.id,
        buildingId: storageScope.buildingId,
        tenantId: storageScope.tenantId,
        category: "REQUEST_ATTACHMENT",
        visibility: "TENANT_VISIBLE",
        uploadedById: session.user.id,
        maxBytes: REQUEST_ATTACHMENT_MAX_BYTES,
        allowedMimeTypes: REQUEST_ATTACHMENT_ALLOWED_MIME_TYPES,
      })
    }
  } catch (error) {
    await db.request.delete({ where: { id: created.id } }).catch(() => null)
    return { error: error instanceof Error ? error.message : "Не удалось сохранить файл заявки" }
  }

  // Уведомляем только администратора здания/организации. OWNER не получает tenant-facing заявки напрямую.
  {
    const staff = await getTenantAdminContactsForUser(session.user.id)
    const isUrgent = priority === "HIGH" || priority === "URGENT"
    const attachmentNote = storedAttachment ? " Фото/файл приложен." : ""
    for (const s of staff) {
      await notifyUser({
        userId: s.id,
        type: "NEW_REQUEST",
        title: isUrgent ? `🔥 Срочная заявка: ${title}` : `Новая заявка: ${title}`,
        message: `От «${tenant.companyName}»: ${description.length > 100 ? description.slice(0, 97) + "..." : description}${attachmentNote}`,
        link: `/admin/requests/${created.id}`,
        // Email только для срочных — обычные заявки летят админам пачками,
        // не хочется забивать им инбокс.
        sendEmail: isUrgent,
      })
    }
  }

  revalidatePath("/cabinet/requests")
  revalidatePath("/cabinet")
  return { success: true }
}

async function parseRequestAttachment(fileValue: FormDataEntryValue | null) {
  if (!(fileValue instanceof File) || fileValue.size === 0) return null

  const mime = fileValue.type.trim().toLowerCase()
  if (!REQUEST_ATTACHMENT_ALLOWED_MIME_TYPES.has(mime)) {
    return { error: "К заявке можно приложить PDF, JPG, PNG или WebP" as const }
  }

  if (fileValue.size > REQUEST_ATTACHMENT_MAX_BYTES) {
    return { error: "Файл заявки не должен быть больше 5 МБ" as const }
  }

  return {
    name: fileValue.name.slice(0, 160),
    mime,
    buffer: Buffer.from(await fileValue.arrayBuffer()),
  }
}
