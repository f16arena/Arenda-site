import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { getCurrentBuildingId } from "@/lib/current-building"
import { getOwnerBuildingMetrics } from "@/lib/owner-dashboard"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { safeServerValue } from "@/lib/server-fallback"

export const dynamic = "force-dynamic"

/**
 * Разрез по зданиям за текущий месяц для обзора, когда выбраны все здания.
 * Раньше здесь же считались график денег, последние заявки/задачи и арендаторы —
 * обзор их больше не показывает (они на своих страницах), поэтому и не считаем.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }
  if (session.user.role === "TENANT") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
  }

  const { orgId } = await requireOrgAccess()
  const headers = { "Cache-Control": "private, max-age=300, stale-while-revalidate=60" }

  const buildingId = await getCurrentBuildingId().catch(() => null)
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)
  // Разрез имеет смысл только по всем зданиям сразу
  const accessibleBuildingIds = buildingId ? [] : await getAccessibleBuildingIdsForSession(orgId)
  if (accessibleBuildingIds.length === 0) {
    return NextResponse.json({ buildingBreakdown: [] }, { headers })
  }

  const now = new Date()
  const buildingBreakdown = await safeServerValue(
    getOwnerBuildingMetrics({
      buildingIds: accessibleBuildingIds,
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    }),
    [],
    { source: "admin.dashboard.lazy.buildingBreakdown", route: "/admin", orgId, userId: session.user.id },
  )

  return NextResponse.json({ buildingBreakdown }, { headers })
}
