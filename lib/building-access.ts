import { auth } from "@/auth"
import { db } from "./db"
import { cache } from "react"

export const ALL_BUILDINGS_COOKIE = "__all__"

const STAFF_SCOPED_ROLES = new Set(["ADMIN", "ACCOUNTANT", "FACILITY_MANAGER", "EMPLOYEE"])

export type AccessibleBuilding = {
  id: string
  name: string
  address: string
}

export function isOwnerLike(role?: string | null, isPlatformOwner?: boolean | null) {
  return !!isPlatformOwner || role === "OWNER"
}

export function isStaffScopedRole(role?: string | null) {
  return STAFF_SCOPED_ROLES.has(role ?? "")
}

export async function getAccessibleBuildingsForUser({
  userId,
  orgId,
  role,
  isPlatformOwner,
}: {
  userId: string
  orgId: string
  role?: string | null
  isPlatformOwner?: boolean | null
}): Promise<AccessibleBuilding[]> {
  return getAccessibleBuildingsForUserCached(userId, orgId, role ?? null, !!isPlatformOwner)
}

const getAccessibleBuildingsForUserCached = cache(async (
  userId: string,
  orgId: string,
  role: string | null,
  isPlatformOwner: boolean,
): Promise<AccessibleBuilding[]> => {
  if (isOwnerLike(role, isPlatformOwner)) {
    return db.building.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, name: true, address: true },
      orderBy: { createdAt: "asc" },
    })
  }

  if (!isStaffScopedRole(role)) return []

  try {
    const access = await db.userBuildingAccess.findMany({
      where: {
        userId,
        building: { organizationId: orgId, isActive: true },
      },
      select: {
        building: { select: { id: true, name: true, address: true, createdAt: true } },
      },
      orderBy: { building: { createdAt: "asc" } },
    })

    const buildings = access.map((a) => a.building)
    if (buildings.length > 0) return buildings.map(({ id, name, address }) => ({ id, name, address }))
  } catch {
    // During rollout the table may not exist yet. Fall back to legacy behavior below.
  }

  const legacy = await db.building.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      OR: [
        { administratorUserId: userId },
        // Pre-1.3.0 behavior gave org staff broad visibility. Keep that as a safe rollout fallback
        // until the migration/backfill is applied.
        { administratorUserId: null },
      ],
    },
    select: { id: true, name: true, address: true },
    orderBy: { createdAt: "asc" },
  })

  if (legacy.length > 0) return legacy

  return db.building.findMany({
    where: { organizationId: orgId, isActive: true },
    select: { id: true, name: true, address: true },
    orderBy: { createdAt: "asc" },
  })
})

export async function getAccessibleBuildingsForSession(orgId: string) {
  const session = await auth()
  if (!session?.user) return []

  return getAccessibleBuildingsForUser({
    userId: session.user.id,
    orgId,
    role: session.user.role,
    isPlatformOwner: session.user.isPlatformOwner,
  })
}

export async function getAccessibleBuildingIdsForSession(orgId: string) {
  return (await getAccessibleBuildingsForSession(orgId)).map((b) => b.id)
}

export async function assertBuildingAccess(buildingId: string, orgId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Не авторизован")

  const ids = (await getAccessibleBuildingsForUser({
    userId: session.user.id,
    orgId,
    role: session.user.role,
    isPlatformOwner: session.user.isPlatformOwner,
  })).map((b) => b.id)

  if (!ids.includes(buildingId)) {
    throw new Error("Нет доступа к этому зданию")
  }
}

export async function assertTenantBuildingAccess(tenantId: string, orgId: string) {
  const session = await auth()
  if (!session?.user) throw new Error("Не авторизован")

  const tenant = await db.tenant.findFirst({
    where: { id: tenantId, user: { organizationId: orgId } },
    select: {
      space: { select: { floor: { select: { buildingId: true } } } },
      tenantSpaces: { select: { space: { select: { floor: { select: { buildingId: true } } } } } },
      fullFloors: { select: { buildingId: true } },
    },
  })
  if (!tenant) throw new Error("Арендатор не найден или нет доступа")

  if (isOwnerLike(session.user.role, session.user.isPlatformOwner)) return

  const tenantBuildingIds = [
    tenant.space?.floor.buildingId,
    ...tenant.tenantSpaces.map((item) => item.space.floor.buildingId),
    ...tenant.fullFloors.map((floor) => floor.buildingId),
  ].filter(Boolean) as string[]

  if (tenantBuildingIds.length === 0) {
    throw new Error("Арендатор не привязан к доступному зданию")
  }

  const accessibleIds = (await getAccessibleBuildingsForUser({
    userId: session.user.id,
    orgId,
    role: session.user.role,
    isPlatformOwner: session.user.isPlatformOwner,
  })).map((b) => b.id)
  const accessible = new Set(accessibleIds)

  if (!tenantBuildingIds.some((id) => accessible.has(id))) {
    throw new Error("Нет доступа к зданию этого арендатора")
  }
}

export async function replaceUserBuildingAccess(userId: string, buildingIds: string[], orgId: string) {
  const ids = [...new Set(buildingIds.filter(Boolean))]
  if (ids.length > 0) {
    const count = await db.building.count({
      where: { id: { in: ids }, organizationId: orgId },
    })
    if (count !== ids.length) throw new Error("Некоторые здания недоступны")
  }

  await db.$transaction([
    db.userBuildingAccess.deleteMany({ where: { userId } }),
    ...(ids.length > 0
      ? [
          db.userBuildingAccess.createMany({
            data: ids.map((buildingId) => ({ userId, buildingId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ])
}
