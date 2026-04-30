import { cookies } from "next/headers"
import { db } from "./db"

const COOKIE_NAME = "currentBuildingId"

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

  const store = await cookies()
  const fromCookie = store.get(COOKIE_NAME)?.value
  if (fromCookie) {
    const exists = await db.building.findUnique({
      where: { id: fromCookie },
      select: { id: true, isActive: true, organizationId: true },
    })
    // Cookie действителен ТОЛЬКО если здание из текущей орги
    if (exists?.isActive && exists.organizationId === orgId) return fromCookie
  }

  // Fallback: первое активное здание ТОЛЬКО в текущей орге
  const first = await db.building.findFirst({
    where: { isActive: true, organizationId: orgId },
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
