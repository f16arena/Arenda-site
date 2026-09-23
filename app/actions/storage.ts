"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { requireOrgAccess } from "@/lib/org"
import { audit } from "@/lib/audit"
import { getAccessibleBuildingsForUser, isOwnerLike } from "@/lib/building-access"
import { revalidatePath } from "next/cache"
import { assertBuildingInOrg, assertTenantInOrg } from "@/lib/scope-guards"
import { storeUploadedFile, TENANT_DOCUMENT_ALLOWED_MIME_TYPES, TENANT_DOCUMENT_MAX_BYTES } from "@/lib/storage"
import { getT } from "@/lib/i18n/server"

export async function deleteStoredFile(fileId: string) {
  await requireCapabilityAndFeature("storage.delete")
  const session = await auth()
  const { t } = await getT()
  if (!session?.user) return { error: t("actions.common.noAccess") }
  const { orgId } = await requireOrgAccess()

  const file = await db.storedFile.findFirst({
    where: { id: fileId, organizationId: orgId, deletedAt: null },
    select: {
      id: true,
      fileName: true,
      buildingId: true,
      tenantId: true,
      tenantDocument: { select: { id: true } },
      _count: { select: { paymentReports: true } },
    },
  })
  if (!file) return { error: t("actions.storage.fileNotFoundOrNoAccess") }

  const canAccess = await canManageStoredFile({
    orgId,
    userId: session.user.id,
    role: session.user.role,
    isPlatformOwner: session.user.isPlatformOwner,
    buildingId: file.buildingId,
    tenantId: file.tenantId,
  })
  if (!canAccess) return { error: t("actions.storage.noFileAccess") }

  if (file.tenantDocument || file._count.paymentReports > 0) {
    return {
      error: t("actions.storage.linkedToDocument"),
    }
  }

  await db.storedFile.update({
    where: { id: file.id },
    data: { deletedAt: new Date() },
  })
  await audit({
    action: "DELETE",
    entity: "storage",
    entityId: file.id,
    details: { fileName: file.fileName },
  })
  revalidatePath("/admin/storage")
  return { ok: true }
}

async function canManageStoredFile({
  orgId,
  userId,
  role,
  isPlatformOwner,
  buildingId,
  tenantId,
}: {
  orgId: string
  userId: string
  role?: string | null
  isPlatformOwner?: boolean | null
  buildingId: string | null
  tenantId: string | null
}) {
  if (isOwnerLike(role, isPlatformOwner)) return true

  const accessibleIds = new Set((await getAccessibleBuildingsForUser({
    userId,
    orgId,
    role,
    isPlatformOwner,
  })).map((building) => building.id))

  if (buildingId && accessibleIds.has(buildingId)) return true
  if (!tenantId) return false

  const tenant = await db.tenant.findFirst({
    where: { id: tenantId, user: { organizationId: orgId } },
    select: {
      space: { select: { floor: { select: { buildingId: true } } } },
      tenantSpaces: { select: { space: { select: { floor: { select: { buildingId: true } } } } } },
      fullFloors: { select: { buildingId: true } },
      buildingId: true,
    },
  })

  const ids = [
    tenant?.space?.floor.buildingId,
    ...(tenant?.tenantSpaces.map((item) => item.space.floor.buildingId) ?? []),
    ...(tenant?.fullFloors.map((floor) => floor.buildingId) ?? []),
    // Арендатор без помещения (киоск, антенна) — привязан к зданию напрямую.
    tenant?.buildingId,
  ].filter(Boolean) as string[]

  return ids.some((id) => accessibleIds.has(id))
}

/** Вернуть файл из корзины. */
export async function restoreStoredFile(fileId: string) {
  await requireCapabilityAndFeature("storage.delete")
  const session = await auth()
  const { t } = await getT()
  if (!session?.user) return { error: t("actions.common.noAccess") }
  const { orgId } = await requireOrgAccess()

  const file = await db.storedFile.findFirst({
    where: { id: fileId, organizationId: orgId, deletedAt: { not: null } },
    select: { id: true, fileName: true, buildingId: true, tenantId: true },
  })
  if (!file) return { error: t("actions.storage.fileNotFound") }
  const canAccess = await canManageStoredFile({
    orgId,
    userId: session.user.id,
    role: session.user.role,
    isPlatformOwner: session.user.isPlatformOwner,
    buildingId: file.buildingId,
    tenantId: file.tenantId,
  })
  if (!canAccess) return { error: t("actions.storage.noFileAccess") }

  await db.storedFile.update({ where: { id: file.id }, data: { deletedAt: null } })
  await audit({ action: "UPDATE", entity: "storage", entityId: file.id, details: { fileName: file.fileName, restored: true } })
  revalidatePath("/admin/storage")
  return { ok: true }
}

/**
 * Загрузить файл в хранилище вручную (страница «Хранилище»). Можно привязать
 * к арендатору или зданию — тогда он виден в их разделах и в фильтрах.
 */
export async function uploadToStorage(formData: FormData): Promise<{ ok?: true; error?: string }> {
  // Переводчик нужен и в catch — объявляем до try.
  const { t } = await getT()
  try {
    const session = await requireCapabilityAndFeature("storage.upload")
    const { orgId } = await requireOrgAccess()
    const file = formData.get("file")
    if (!(file instanceof File) || file.size === 0) return { error: t("actions.storage.selectFile") }

    const tenantId = String(formData.get("tenantId") ?? "").trim() || null
    const buildingIdRaw = String(formData.get("buildingId") ?? "").trim() || null
    const visibility = String(formData.get("visibility") ?? "ADMIN_ONLY") === "TENANT_VISIBLE" ? "TENANT_VISIBLE" : "ADMIN_ONLY"

    if (tenantId) await assertTenantInOrg(tenantId, orgId)
    if (buildingIdRaw) await assertBuildingInOrg(buildingIdRaw, orgId)
    const canAccess = await canManageStoredFile({
      orgId,
      userId: session.id,
      role: session.role,
      isPlatformOwner: session.isPlatformOwner,
      buildingId: buildingIdRaw,
      tenantId,
    })
    if (!canAccess) return { error: t("actions.storage.noBuildingOrTenantAccess") }
    if (visibility === "TENANT_VISIBLE" && !tenantId) {
      return { error: t("actions.storage.tenantVisibleNeedsTenant") }
    }

    await storeUploadedFile({
      organizationId: orgId,
      file,
      ownerType: "OTHER",
      category: "OTHER",
      visibility,
      tenantId,
      buildingId: buildingIdRaw,
      uploadedById: session.id,
      maxBytes: TENANT_DOCUMENT_MAX_BYTES,
      allowedMimeTypes: TENANT_DOCUMENT_ALLOWED_MIME_TYPES,
    })
    revalidatePath("/admin/storage")
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : t("actions.common.uploadFailed") }
  }
}
