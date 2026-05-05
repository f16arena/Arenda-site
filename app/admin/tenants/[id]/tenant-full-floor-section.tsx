import { floorScope } from "@/lib/tenant-scope"
import { db } from "@/lib/db"
import { FullFloorAssignLoader } from "./client-section-loaders"
import { safeServerValue } from "@/lib/server-fallback"

export async function TenantFullFloorSection({
  tenantId,
  orgId,
  visibleBuildingIds,
  currentFloors,
}: {
  tenantId: string
  orgId: string
  visibleBuildingIds: string[]
  currentFloors: { id: string; name: string; fixedMonthlyRent: number | null }[]
}) {
  const floors = await safeServerValue(
    db.floor.findMany({
      where: {
        AND: [
          floorScope(orgId),
          { buildingId: { in: visibleBuildingIds } },
        ],
      },
      select: {
        id: true,
        name: true,
        totalArea: true,
        ratePerSqm: true,
        fullFloorTenantId: true,
        fixedMonthlyRent: true,
      },
      orderBy: { number: "asc" },
    }),
    [] as Array<{
    id: string
    name: string
    totalArea: number | null
    ratePerSqm: number
    fullFloorTenantId: string | null
    fixedMonthlyRent: number | null
  }>,
    { source: "admin.tenant.fullFloors", route: "/admin/tenants/[id]", orgId, entity: "tenant", entityId: tenantId },
  )

  return (
    <FullFloorAssignLoader
      tenantId={tenantId}
      floors={floors}
      currentFloors={currentFloors}
    />
  )
}
