import { db } from "@/lib/db"
import { getAccessibleBuildingsForUser } from "@/lib/building-access"

type MobileUser = {
  id: string
  role?: string | null
  isPlatformOwner?: boolean | null
}

export async function getMobileAccessibleBuildings(user: MobileUser, orgId: string) {
  if (user.role !== "TENANT") {
    return getAccessibleBuildingsForUser({
      userId: user.id,
      orgId,
      role: user.role,
      isPlatformOwner: user.isPlatformOwner,
    })
  }

  const tenant = await db.tenant.findFirst({
    where: { userId: user.id, user: { organizationId: orgId } },
    select: {
      space: {
        select: {
          floor: { select: { building: { select: { id: true, name: true, address: true } } } },
        },
      },
      tenantSpaces: {
        select: {
          space: {
            select: {
              floor: { select: { building: { select: { id: true, name: true, address: true } } } },
            },
          },
        },
      },
      fullFloors: {
        select: { building: { select: { id: true, name: true, address: true } } },
      },
    },
  })

  const buildings = [
    tenant?.space?.floor.building,
    ...(tenant?.tenantSpaces.map((item) => item.space.floor.building) ?? []),
    ...(tenant?.fullFloors.map((floor) => floor.building) ?? []),
  ].filter(Boolean) as Array<{ id: string; name: string; address: string }>

  return [...new Map(buildings.map((building) => [building.id, building])).values()]
}

export async function getBuildingNoticeRecipients(orgId: string, buildingId: string) {
  const [building, tenantUsers, accessUsers, owners] = await Promise.all([
    db.building.findFirst({
      where: { id: buildingId, organizationId: orgId, isActive: true },
      select: { administratorUserId: true },
    }),
    db.tenant.findMany({
      where: {
        user: { organizationId: orgId, isActive: true },
        OR: [
          { space: { floor: { buildingId } } },
          { tenantSpaces: { some: { space: { floor: { buildingId } } } } },
          { fullFloors: { some: { buildingId } } },
        ],
      },
      select: { userId: true },
    }),
    db.userBuildingAccess.findMany({
      where: { buildingId, user: { organizationId: orgId, isActive: true } },
      select: { userId: true },
    }),
    db.user.findMany({
      where: { organizationId: orgId, isActive: true, role: "OWNER" },
      select: { id: true },
    }),
  ])

  if (!building) return []

  return [
    ...tenantUsers.map((item) => item.userId),
    ...accessUsers.map((item) => item.userId),
    ...owners.map((item) => item.id),
    building.administratorUserId,
  ].filter((id, index, arr): id is string => !!id && arr.indexOf(id) === index)
}
