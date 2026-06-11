import "server-only"

import { unstable_cache } from "next/cache"
import { db } from "@/lib/db"
import { getAccessibleBuildingsForUser, isOwnerLike, type AccessibleBuilding } from "@/lib/building-access"
import { SECTIONS, type Section } from "@/lib/acl"
import { getAllowedCapabilityKeysForUser, getAllowedSectionsForUser } from "@/lib/capabilities"

export const ADMIN_SHELL_CACHE_TAG = "admin-shell"
export const ADMIN_NOTIFICATION_CACHE_TAG = "admin-notifications"
export const PLANS_CACHE_TAG = "plans"
export const BUILDINGS_CACHE_TAG = "buildings"
export const FLOORS_CACHE_TAG = "floors"

/** Tag для инвалидации списка зданий конкретной организации. */
export const buildingsForOrgTag = (orgId: string) => `buildings:${orgId}`
/** Tag для инвалидации списка этажей конкретного здания. */
export const floorsForBuildingTag = (buildingId: string) => `floors:${buildingId}`

export type AdminShellOrg = {
  id: string
  name: string
  shortName: string | null
  directorName: string | null
  isSuspended: boolean | null
  planExpiresAtIso: string | null
  logoUrl: string | null
}

export type AdminShellUser = {
  name: string | null
  email: string | null
  emailVerifiedAtIso: string | null
}

export const getCachedAdminShellOrg = unstable_cache(
  async (orgId: string): Promise<AdminShellOrg | null> => {
    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, shortName: true, directorName: true, isSuspended: true, planExpiresAt: true, logoUrl: true },
    })
    if (!org) return null
    return {
      id: org.id,
      name: org.name,
      shortName: org.shortName,
      directorName: org.directorName,
      isSuspended: org.isSuspended,
      planExpiresAtIso: org.planExpiresAt?.toISOString() ?? null,
      logoUrl: org.logoUrl ?? null,
    }
  },
  ["admin-shell-org"],
  { revalidate: 60, tags: [ADMIN_SHELL_CACHE_TAG] },
)

export const getCachedAdminShellUser = unstable_cache(
  async (userId: string): Promise<AdminShellUser | null> => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, emailVerifiedAt: true },
    })
    if (!user) return null
    return {
      name: user.name,
      email: user.email,
      emailVerifiedAtIso: user.emailVerifiedAt?.toISOString() ?? null,
    }
  },
  ["admin-shell-user"],
  { revalidate: 60, tags: [ADMIN_SHELL_CACHE_TAG] },
)

export const getCachedAdminShellBuildings = unstable_cache(
  async (
    userId: string,
    orgId: string,
    role: string | null,
    isPlatformOwner: boolean,
  ): Promise<AccessibleBuilding[]> => {
    return getAccessibleBuildingsForUser({ userId, orgId, role, isPlatformOwner })
  },
  ["admin-shell-buildings"],
  { revalidate: 60, tags: [ADMIN_SHELL_CACHE_TAG] },
)

export const getCachedAdminShellSections = unstable_cache(
  async (userId: string, role: string, isPlatformOwner: boolean): Promise<Section[]> => {
    if (isOwnerLike(role, isPlatformOwner)) return [...SECTIONS]
    return getAllowedSectionsForUser({ userId, role, isPlatformOwner })
  },
  ["admin-shell-sections"],
  { revalidate: 60, tags: [ADMIN_SHELL_CACHE_TAG] },
)

export const getCachedAdminShellCapabilities = unstable_cache(
  async (userId: string, role: string, isPlatformOwner: boolean, orgId: string | null): Promise<string[]> => {
    return getAllowedCapabilityKeysForUser({ userId, role, isPlatformOwner, orgId })
  },
  ["admin-shell-capabilities"],
  { revalidate: 60, tags: [ADMIN_SHELL_CACHE_TAG] },
)

export const getCachedUnreadNotificationCount = unstable_cache(
  async (userId: string): Promise<number> => {
    return db.notification.count({
      where: { userId, isRead: false },
    })
  },
  ["admin-shell-unread-notifications"],
  { revalidate: 10, tags: [ADMIN_NOTIFICATION_CACHE_TAG] },
)

// ─────────────────────────────────────────────────────────────────────────────
// Domain caches: список зданий / тарифов / этажей
// ─────────────────────────────────────────────────────────────────────────────
//
// `unstable_cache` принимает массив тегов как фиксированную опцию — функция от
// аргументов там не работает. Поэтому используется паттерн «фабрика»: создаём
// `unstable_cache(...)` каждый раз с уже подставленным orgId/buildingId — и в
// keyParts, и в tags. Это рабочий способ инвалидации per-tenant ресурса.

export type CachedBuildingForOrg = {
  id: string
  name: string
  address: string
  totalArea: number | null
  isActive: boolean
  createdAtIso: string
  floors: { id: string; number: number; name: string }[]
}

export const getCachedBuildingsForOrg = (orgId: string): Promise<CachedBuildingForOrg[]> =>
  unstable_cache(
    async (): Promise<CachedBuildingForOrg[]> => {
      const buildings = await db.building.findMany({
        where: { organizationId: orgId, isActive: true },
        select: {
          id: true,
          name: true,
          address: true,
          totalArea: true,
          isActive: true,
          createdAt: true,
          floors: { select: { id: true, number: true, name: true }, orderBy: { number: "asc" } },
        },
        orderBy: [{ createdAt: "asc" }],
      })
      return buildings.map((b) => ({
        id: b.id,
        name: b.name,
        address: b.address,
        totalArea: b.totalArea,
        isActive: b.isActive,
        createdAtIso: b.createdAt.toISOString(),
        floors: b.floors,
      }))
    },
    ["buildings-for-org", orgId],
    { revalidate: 60, tags: [buildingsForOrgTag(orgId), BUILDINGS_CACHE_TAG] },
  )()

export type CachedPlan = {
  id: string
  code: string
  name: string
  description: string | null
  priceMonthly: number
  priceYearly: number
  maxBuildings: number | null
  maxTenants: number | null
  maxUsers: number | null
  maxLeads: number | null
  features: string
  isActive: boolean
  sortOrder: number
}

export const getCachedPlans = unstable_cache(
  async (): Promise<CachedPlan[]> => {
    const plans = await db.plan.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        priceMonthly: true,
        priceYearly: true,
        maxBuildings: true,
        maxTenants: true,
        maxUsers: true,
        maxLeads: true,
        features: true,
        isActive: true,
        sortOrder: true,
      },
    })
    return plans
  },
  ["plans"],
  { revalidate: 600, tags: [PLANS_CACHE_TAG] },
)

export type CachedFloorForBuilding = {
  id: string
  number: number
  name: string
  ratePerSqm: number
  totalArea: number | null
  layoutJson: string | null
  fixedMonthlyRent: number | null
}

export const getCachedFloorsForBuilding = (buildingId: string): Promise<CachedFloorForBuilding[]> =>
  unstable_cache(
    async (): Promise<CachedFloorForBuilding[]> => {
      return db.floor.findMany({
        where: { buildingId },
        select: {
          id: true,
          number: true,
          name: true,
          ratePerSqm: true,
          totalArea: true,
          layoutJson: true,
          fixedMonthlyRent: true,
        },
        orderBy: { number: "asc" },
      })
    },
    ["floors-for-building", buildingId],
    { revalidate: 60, tags: [floorsForBuildingTag(buildingId), FLOORS_CACHE_TAG] },
  )()
