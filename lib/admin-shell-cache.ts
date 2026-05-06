import "server-only"

import { unstable_cache } from "next/cache"
import { db } from "@/lib/db"
import { getAccessibleBuildingsForUser, isOwnerLike, type AccessibleBuilding } from "@/lib/building-access"
import { SECTIONS, type Section } from "@/lib/acl"
import { getAllowedCapabilityKeysForUser, getAllowedSectionsForUser } from "@/lib/capabilities"

export const ADMIN_SHELL_CACHE_TAG = "admin-shell"
export const ADMIN_NOTIFICATION_CACHE_TAG = "admin-notifications"

export type AdminShellOrg = {
  id: string
  name: string
  shortName: string | null
  directorName: string | null
  isSuspended: boolean | null
  planExpiresAtIso: string | null
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
      select: { id: true, name: true, shortName: true, directorName: true, isSuspended: true, planExpiresAt: true },
    })
    if (!org) return null
    return {
      id: org.id,
      name: org.name,
      shortName: org.shortName,
      directorName: org.directorName,
      isSuspended: org.isSuspended,
      planExpiresAtIso: org.planExpiresAt?.toISOString() ?? null,
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
