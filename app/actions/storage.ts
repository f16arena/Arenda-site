"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireSection } from "@/lib/acl"
import { requireOrgAccess } from "@/lib/org"
import { audit } from "@/lib/audit"
import { getAccessibleBuildingsForUser, isOwnerLike } from "@/lib/building-access"
import { revalidatePath } from "next/cache"

export async function deleteStoredFile(fileId: string) {
  await requireSection("documents", "edit")
  const session = await auth()
  if (!session?.user) return { error: "Не авторизован" }
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
  if (!file) return { error: "Файл не найден или нет доступа" }

  const canAccess = await canManageStoredFile({
    orgId,
    userId: session.user.id,
    role: session.user.role,
    isPlatformOwner: session.user.isPlatformOwner,
    buildingId: file.buildingId,
    tenantId: file.tenantId,
  })
  if (!canAccess) return { error: "Нет доступа к этому файлу" }

  if (file.tenantDocument || file._count.paymentReports > 0) {
    return {
      error: "Файл связан с документом или оплатой. Удалите его из карточки арендатора/заявки оплаты, чтобы сохранить историю корректной.",
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
    },
  })

  const ids = [
    tenant?.space?.floor.buildingId,
    ...(tenant?.tenantSpaces.map((item) => item.space.floor.buildingId) ?? []),
    ...(tenant?.fullFloors.map((floor) => floor.buildingId) ?? []),
  ].filter(Boolean) as string[]

  return ids.some((id) => accessibleIds.has(id))
}
