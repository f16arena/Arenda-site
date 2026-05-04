import { floorScope } from "@/lib/tenant-scope"
import { db } from "@/lib/db"
import { FullFloorAssignLoader } from "./client-section-loaders"

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
  const floors = await db.floor.findMany({
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
  }).catch(() => [] as Array<{
    id: string
    name: string
    totalArea: number | null
    ratePerSqm: number
    fullFloorTenantId: string | null
    fixedMonthlyRent: number | null
  }>)

  return (
    <FullFloorAssignLoader
      tenantId={tenantId}
      floors={floors}
      currentFloors={currentFloors}
    />
  )
}
