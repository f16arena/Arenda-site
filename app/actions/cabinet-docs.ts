"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import {
  TENANT_DOCUMENT_ALLOWED_MIME_TYPES,
  TENANT_DOCUMENT_MAX_BYTES,
  getTenantStorageScope,
  storeUploadedFile,
} from "@/lib/storage"

/** Текущий арендатор по сессии (профиль кабинета). */
async function currentTenant() {
  const session = await auth()
  if (!session?.user) return null
  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    select: { id: true, user: { select: { id: true, organizationId: true } } },
  })
  if (!tenant?.user.organizationId) return null
  return { tenantId: tenant.id, userId: tenant.user.id, orgId: tenant.user.organizationId }
}

/** Арендатор загружает свой документ в кабинет («Мои документы»). */
export async function uploadMyDocument(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const me = await currentTenant()
  if (!me) return { ok: false, error: "Профиль арендатора не найден" }

  const name = String(formData.get("name") ?? "").trim()
  const type = String(formData.get("type") ?? "OTHER")
  const file = formData.get("file")
  if (!name) return { ok: false, error: "Укажите название документа" }
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Прикрепите файл" }

  const scope = await getTenantStorageScope(me.tenantId)
  let storedFile: { id: string; url: string } | null = null
  try {
    storedFile = await storeUploadedFile({
      organizationId: me.orgId,
      file,
      ownerType: "TENANT_DOCUMENT",
      ownerId: me.tenantId,
      buildingId: scope.buildingId,
      tenantId: scope.tenantId,
      category: "TENANT_DOCUMENT",
      visibility: "TENANT_VISIBLE",
      uploadedById: me.userId,
      maxBytes: TENANT_DOCUMENT_MAX_BYTES,
      allowedMimeTypes: TENANT_DOCUMENT_ALLOWED_MIME_TYPES,
    })
    const doc = await db.tenantDocument.create({
      data: { tenantId: me.tenantId, type, name, fileUrl: storedFile.url, storageFileId: storedFile.id },
    })
    await db.storedFile.update({ where: { id: storedFile.id }, data: { ownerId: doc.id } })
  } catch (e) {
    if (storedFile) {
      await db.storedFile.update({ where: { id: storedFile.id }, data: { deletedAt: new Date() } }).catch(() => null)
    }
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось загрузить файл" }
  }

  revalidatePath("/cabinet/documents")
  revalidatePath(`/admin/tenants/${me.tenantId}`)
  return { ok: true }
}

/** Арендатор удаляет СВОЙ загруженный документ. */
export async function deleteMyDocument(documentId: string): Promise<{ ok: boolean; error?: string }> {
  const me = await currentTenant()
  if (!me) return { ok: false, error: "Профиль арендатора не найден" }

  const doc = await db.tenantDocument.findFirst({
    where: { id: documentId, tenantId: me.tenantId },
    select: { id: true, storageFileId: true },
  })
  if (!doc) return { ok: false, error: "Документ не найден" }

  await db.tenantDocument.delete({ where: { id: doc.id } })
  if (doc.storageFileId) {
    await db.storedFile.update({ where: { id: doc.storageFileId }, data: { deletedAt: new Date() } }).catch(() => null)
  }
  revalidatePath("/cabinet/documents")
  revalidatePath(`/admin/tenants/${me.tenantId}`)
  return { ok: true }
}
