"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { assertTenantInOrg, assertRequestInOrg } from "@/lib/scope-guards"
import { notifyUser } from "@/lib/notify"
import { getT, getTForUser } from "@/lib/i18n/server"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { getTenantAdminContactsForUser } from "@/lib/tenant-admin-contact"
import {
  REQUEST_ATTACHMENT_ALLOWED_MIME_TYPES,
  REQUEST_ATTACHMENT_MAX_BYTES,
  getTenantStorageScope,
  storeBufferFile,
} from "@/lib/storage"
import { RequestCreateSchema, firstZodError } from "@/lib/schemas"

export async function createRequestAdmin(formData: FormData) {
  await requireCapabilityAndFeature("requests.manage")
  const { t } = await getT()
  const { orgId } = await requireOrgAccess()

  const tenantId = formData.get("tenantId") as string
  await assertTenantInOrg(tenantId, orgId)

  const parsed = RequestCreateSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    type: formData.get("type"),
    priority: formData.get("priority"),
  })
  if (!parsed.success) return { error: firstZodError(parsed.error) }
  const { title, description, type, priority } = parsed.data

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { userId: true },
  })
  if (!tenant) return { error: t("actions.common.tenantNotFound") }

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
  const { t } = await getT()
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
    // Уведомление читает арендатор — статус и текст берём на его языке.
    const { t: tTenant } = await getTForUser(before.userId)
    const statusLabel: Record<string, string> = {
      NEW: tTenant("actions.requests.statusNew"),
      IN_PROGRESS: tTenant("actions.requests.statusInProgress"),
      WAITING: tTenant("actions.requests.statusWaiting"),
      RESOLVED: tTenant("actions.requests.statusResolved"),
      CLOSED: tTenant("actions.requests.statusClosed"),
    }
    await notifyUser({
      userId: before.userId,
      type: "REQUEST_STATUS_CHANGED",
      title: tTenant("actions.requests.updatedTitle", { title: before.title }),
      message: tTenant("actions.requests.statusMessage", { status: statusLabel[status] ?? status }),
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
  const { t } = await getT()
  if (!session) return { error: t("actions.common.noAccess") }

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
  const { t } = await getT()
  if (!session) return { error: t("actions.common.noAccess") }
  const organizationId = session.user.organizationId
  if (!organizationId) return { error: t("actions.common.organizationNotFound") }

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    include: {
      space: { select: { number: true, floor: { select: { building: { select: { organizationId: true } } } } } },
      fullFloors: { select: { building: { select: { organizationId: true } } }, take: 1 },
    },
  })
  if (!tenant) return { error: t("actions.common.tenantNotFound") }

  const title = formData.get("title") as string
  const description = formData.get("description") as string
  const type = formData.get("type") as string
  const priority = formData.get("priority") as string
  const attachment = await parseRequestAttachment(formData.get("attachment"), t)
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
    return { error: error instanceof Error ? error.message : t("actions.requests.attachmentSaveFailed") }
  }

  // Уведомляем только администратора здания/организации. OWNER не получает tenant-facing заявки напрямую.
  {
    const staff = await getTenantAdminContactsForUser(session.user.id)
    const isUrgent = priority === "HIGH" || priority === "URGENT"
    for (const s of staff) {
      // Уведомление читает сотрудник — берём язык получателя, а не арендатора.
      const { t: tStaff } = await getTForUser(s.id)
      const attachmentNote = storedAttachment ? ` ${tStaff("actions.requests.attachmentNote")}` : ""
      await notifyUser({
        userId: s.id,
        type: "NEW_REQUEST",
        title: isUrgent
          ? tStaff("actions.requests.urgentTitle", { title })
          : tStaff("actions.requests.newTitle", { title }),
        message: tStaff("actions.requests.newMessage", {
          tenant: tenant.companyName,
          text: description.length > 100 ? description.slice(0, 97) + "..." : description,
        }) + attachmentNote,
        link: `/admin/requests/${created.id}`,
        // Email только для срочных — обычные заявки летят админам пачками,
        // не хочется забивать им инбокс.
        sendEmail: isUrgent,
        // Дедуп: если арендатор случайно дважды нажал «Отправить» — один админ
        // получит одно уведомление (см. AUDIT_2026-05-26.md #22).
        dedupWindowHours: 1,
      })
    }
  }

  revalidatePath("/cabinet/requests")
  revalidatePath("/cabinet")
  return { success: true }
}

// Переводчик приходит параметром: помощник сам его не добывает.
type Tr = Awaited<ReturnType<typeof getT>>["t"]

async function parseRequestAttachment(fileValue: FormDataEntryValue | null, t: Tr) {
  if (!(fileValue instanceof File) || fileValue.size === 0) return null

  const mime = fileValue.type.trim().toLowerCase()
  if (!REQUEST_ATTACHMENT_ALLOWED_MIME_TYPES.has(mime)) {
    return { error: t("actions.requests.badAttachmentType") }
  }

  if (fileValue.size > REQUEST_ATTACHMENT_MAX_BYTES) {
    return { error: t("actions.requests.attachmentTooBig") }
  }

  return {
    name: fileValue.name.slice(0, 160),
    mime,
    buffer: Buffer.from(await fileValue.arrayBuffer()),
  }
}
