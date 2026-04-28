import { cookies } from "next/headers"
import { db } from "./db"

const COOKIE_NAME = "currentBuildingId"

// Возвращает id текущего здания. Если cookie не задан — первое активное в текущей организации.
export async function getCurrentBuildingId(): Promise<string | null> {
  const { getCurrentOrgId } = await import("./org")
  const orgId = await getCurrentOrgId()

  const store = await cookies()
  const fromCookie = store.get(COOKIE_NAME)?.value
  if (fromCookie) {
    const exists = await db.building.findUnique({
      where: { id: fromCookie },
      select: { id: true, isActive: true, organizationId: true },
    })
    if (exists?.isActive && (!orgId || exists.organizationId === orgId)) return fromCookie
  }

  const first = await db.building.findFirst({
    where: orgId ? { isActive: true, organizationId: orgId } : { isActive: true },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  })
  return first?.id ?? null
}

export async function getCurrentBuilding() {
  const id = await getCurrentBuildingId()
  if (!id) return null
  return db.building.findUnique({ where: { id } })
}

export async function setCurrentBuildingCookie(buildingId: string) {
  const store = await cookies()
  store.set(COOKIE_NAME, buildingId, {
    maxAge: 60 * 60 * 24 * 365, // 1 год
    path: "/",
    httpOnly: false, // нужно читать в client-side для switcher
    sameSite: "lax",
  })
}
