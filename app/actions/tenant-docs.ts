"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { assertTenantInOrg, assertTenantDocumentInOrg } from "@/lib/scope-guards"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import {
  TENANT_DOCUMENT_ALLOWED_MIME_TYPES,
  TENANT_DOCUMENT_MAX_BYTES,
  getTenantStorageScope,
  storeUploadedFile,
} from "@/lib/storage"

export async function addTenantDocument(tenantId: string, formData: FormData) {
  await requireCapabilityAndFeature("storage.upload")
  const { orgId, userId } = await requireOrgAccess()
  await assertTenantInOrg(tenantId, orgId)

  const type = String(formData.get("type") ?? "OTHER")
  const name = String(formData.get("name") ?? "").trim()
  const fileUrl = String(formData.get("fileUrl") ?? "").trim()
  const file = formData.get("file")
  const storageScope = await getTenantStorageScope(tenantId)

  if (!name) throw new Error("Название документа обязательно")
  if (!(file instanceof File) || file.size === 0) {
    if (!fileUrl) throw new Error("Прикрепите файл документа")
  }

  let storedFile: { id: string; url: string } | null = null
  try {
    if (file instanceof File && file.size > 0) {
      storedFile = await storeUploadedFile({
        organizationId: orgId,
        file,
        ownerType: "TENANT_DOCUMENT",
        ownerId: tenantId,
        buildingId: storageScope.buildingId,
        tenantId: storageScope.tenantId,
        category: "TENANT_DOCUMENT",
        visibility: "TENANT_VISIBLE",
        uploadedById: userId,
        maxBytes: TENANT_DOCUMENT_MAX_BYTES,
        allowedMimeTypes: TENANT_DOCUMENT_ALLOWED_MIME_TYPES,
      })
    }

    const doc = await db.tenantDocument.create({
      data: {
        tenantId,
        type,
        name,
        fileUrl: storedFile?.url ?? fileUrl,
        storageFileId: storedFile?.id ?? null,
      },
    })

    if (storedFile) {
      await db.storedFile.update({
        where: { id: storedFile.id },
        data: { ownerId: doc.id },
      })
    }
  } catch (e) {
    if (storedFile) {
      await db.storedFile.update({
        where: { id: storedFile.id },
        data: { deletedAt: new Date() },
      }).catch(() => null)
    }
    throw e
  }

  revalidatePath(`/admin/tenants/${tenantId}`)
}

export async function deleteTenantDocument(documentId: string) {
  await requireCapabilityAndFeature("storage.delete")
  const { orgId } = await requireOrgAccess()
  await assertTenantDocumentInOrg(documentId, orgId)

  const doc = await db.tenantDocument.findUnique({
    where: { id: documentId },
    select: { tenantId: true, storageFileId: true },
  })
  if (!doc) throw new Error("Документ не найден")

  await db.tenantDocument.delete({ where: { id: documentId } })
  if (doc.storageFileId) {
    await db.storedFile.update({
      where: { id: doc.storageFileId },
      data: { deletedAt: new Date() },
    }).catch(() => null)
  }
  revalidatePath(`/admin/tenants/${doc.tenantId}`)
}
