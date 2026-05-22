import { db } from "./db"
import { getCurrentBuildingId } from "./current-building"
import { getAccessibleBuildingIdsForSession } from "./building-access"

export type DocumentTenantOption = {
  id: string
  companyName: string
  userName: string
  spaceNumber?: string
}

/**
 * Здания, в скоупе которых формируются документы.
 * Если выбрано конкретное здание (cookie) — только оно; иначе все доступные
 * в рамках организации. Пустой массив = ничего не показываем (изоляция).
 */
export async function getVisibleBuildingIds(orgId: string): Promise<string[]> {
  const currentBuildingId = await getCurrentBuildingId()
  if (currentBuildingId) return [currentBuildingId]
  return getAccessibleBuildingIdsForSession(orgId)
}

/**
 * where-фрагмент для арендаторов выбранных зданий внутри организации.
 * Привязка арендатора к зданию идёт тремя путями (см. tenantScope).
 */
export function buildingScopedTenantWhere(orgId: string, buildingIds: string[]) {
  return {
    user: { organizationId: orgId },
    deletedAt: null,
    OR: [
      { space: { floor: { buildingId: { in: buildingIds } } } },
      { tenantSpaces: { some: { space: { floor: { buildingId: { in: buildingIds } } } } } },
      { fullFloors: { some: { buildingId: { in: buildingIds } } } },
    ],
  }
}

/**
 * Список арендаторов для выпадашек документов, строго в скоупе текущего
 * здания (или всех доступных зданий, если конкретное не выбрано).
 */
export async function getDocumentTenantOptions(orgId: string): Promise<DocumentTenantOption[]> {
  const buildingIds = await getVisibleBuildingIds(orgId)
  if (buildingIds.length === 0) return []

  const tenants = await db.tenant.findMany({
    where: buildingScopedTenantWhere(orgId, buildingIds),
    select: {
      id: true,
      companyName: true,
      space: { select: { number: true } },
      user: { select: { name: true } },
    },
    orderBy: { companyName: "asc" },
  })

  return tenants.map((t) => ({
    id: t.id,
    companyName: t.companyName,
    userName: t.user.name,
    spaceNumber: t.space?.number ?? undefined,
  }))
}
