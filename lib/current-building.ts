import { cookies } from "next/headers"
import { auth } from "@/auth"
import { db } from "./db"
import { ALL_BUILDINGS_COOKIE, getAccessibleBuildingsForUser, isOwnerLike } from "./building-access"
import type { AccessibleBuilding } from "./building-access"

export const CURRENT_BUILDING_COOKIE = "currentBuildingId"

export function resolveCurrentBuildingIdFromSelection({
  cookieValue,
  accessibleBuildings,
  role,
  isPlatformOwner,
}: {
  cookieValue?: string | null
  accessibleBuildings: AccessibleBuilding[]
  role?: string | null
  isPlatformOwner?: boolean | null
}): string | null {
  if (cookieValue === ALL_BUILDINGS_COOKIE) return null

  const accessibleIds = new Set(accessibleBuildings.map((building) => building.id))
  if (cookieValue && accessibleIds.has(cookieValue)) return cookieValue

  // OWNER по умолчанию видит агрегат "Все здания"; ADMIN с несколькими зданиями — "Мои здания".
  if (isOwnerLike(role, isPlatformOwner)) return null
  if (accessibleBuildings.length === 1) return accessibleBuildings[0].id
  return null
}

/**
 * Возвращает id текущего здания только в скоупе текущей орги.
 *
 * БЕЗОПАСНОСТЬ: если orgId === null (нет сессии или платформ-админ без
 * выбранной организации) — возвращаем null. Раньше тут был fallback,
 * который мог вернуть ЛЮБОЕ активное здание из БД — это была дыра.
 */
export async function getCurrentBuildingId(): Promise<string | null> {
  const { getCurrentOrgId } = await import("./org")
  const orgId = await getCurrentOrgId()

  // КРИТИЧНО: без orgId не возвращаем здание. Никаких fallback на "любое".
  if (!orgId) return null

  const session = await auth()
  if (!session?.user) return null

  const accessible = await getAccessibleBuildingsForUser({
    userId: session.user.id,
    orgId,
    role: session.user.role,
    isPlatformOwner: session.user.isPlatformOwner,
  })
  const store = await cookies()
  return resolveCurrentBuildingIdFromSelection({
    cookieValue: store.get(CURRENT_BUILDING_COOKIE)?.value,
    accessibleBuildings: accessible,
    role: session.user.role,
    isPlatformOwner: session.user.isPlatformOwner,
  })
}

export async function getCurrentBuilding() {
  const id = await getCurrentBuildingId()
  if (!id) return null
  return db.building.findUnique({ where: { id } })
}

export async function setCurrentBuildingCookie(buildingId: string) {
  const store = await cookies()
  store.set(CURRENT_BUILDING_COOKIE, buildingId || ALL_BUILDINGS_COOKIE, {
    maxAge: 60 * 60 * 24 * 365, // 1 год
    path: "/",
    httpOnly: false, // нужно читать в client-side для switcher
    sameSite: "lax",
  })
}
