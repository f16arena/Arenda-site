import { db } from "@/lib/db"

export type TenantAdminContact = {
  id: string
  name: string
  role: string
  phone: string | null
  email: string | null
}

function isTenantVisibleAdmin(user: TenantAdminContact & { isActive?: boolean; organizationId?: string | null }, orgId: string | null) {
  return user.isActive !== false && user.role === "ADMIN" && (!orgId || user.organizationId === orgId)
}

async function fallbackAdmins(orgId: string | null): Promise<TenantAdminContact[]> {
  if (!orgId) return []
  return db.user.findMany({
    where: {
      organizationId: orgId,
      isActive: true,
      role: "ADMIN",
    },
    select: {
      id: true,
      name: true,
      role: true,
      phone: true,
      email: true,
    },
    orderBy: { name: "asc" },
  })
}

export async function getBuildingTenantAdminContacts(orgId: string | null, buildingId: string | null): Promise<TenantAdminContact[]> {
  if (!orgId) return []

  if (buildingId) {
    const building = await db.building.findFirst({
      where: { id: buildingId, organizationId: orgId, isActive: true },
      select: {
        administrator: {
          select: {
            id: true,
            name: true,
            role: true,
            phone: true,
            email: true,
            isActive: true,
            organizationId: true,
          },
        },
      },
    })

    const administrator = building?.administrator
    if (administrator && isTenantVisibleAdmin(administrator, orgId)) {
      return [{
        id: administrator.id,
        name: administrator.name,
        role: administrator.role,
        phone: administrator.phone,
        email: administrator.email,
      }]
    }
  }

  return fallbackAdmins(orgId)
}

export async function getTenantAdminContactsForUser(userId: string): Promise<TenantAdminContact[]> {
  const tenant = await db.tenant.findUnique({
    where: { userId },
    select: {
      user: { select: { organizationId: true } },
      space: {
        select: {
          floor: {
            select: {
              buildingId: true,
            },
          },
        },
      },
      fullFloors: {
        select: { buildingId: true },
        take: 1,
      },
    },
  })

  const orgId = tenant?.user.organizationId ?? null
  const buildingId = tenant?.space?.floor.buildingId ?? tenant?.fullFloors[0]?.buildingId ?? null
  return getBuildingTenantAdminContacts(orgId, buildingId)
}

export async function getTenantAdminContactIdsForUser(userId: string) {
  const contacts = await getTenantAdminContactsForUser(userId)
  return contacts.map((contact) => contact.id)
}
