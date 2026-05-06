import { db } from "@/lib/db"
import { safeServerValue } from "@/lib/server-fallback"

export type OwnerBuildingMetric = {
  id: string
  name: string
  address: string
  income: number
  expenses: number
  profit: number
  debt: number
  debtCount: number
  tenantCount: number
  occupied: number
  totalSpaces: number
  occupiedArea: number
  vacantArea: number
  totalArea: number
  occupancyPercent: number | null
}

type TenantPlacementRow = {
  id: string
  space: { floor: { buildingId: string } } | null
  tenantSpaces: Array<{ space: { floor: { buildingId: string } } }>
  fullFloors: Array<{ buildingId: string }>
}

type AmountByTenantRow = { tenantId: string; _sum: { amount: number | null } }
type DebtByTenantRow = AmountByTenantRow & { _count: { _all: number } }
type ExpenseByBuildingRow = { buildingId: string; _sum: { amount: number | null } }
type SpaceStatusRow = {
  floorId: string
  status: string
  _count: { _all: number }
  _sum: { area: number | null }
}

export async function getOwnerBuildingMetrics({
  buildingIds,
  from,
  to,
}: {
  buildingIds: string[]
  from: Date
  to: Date
}): Promise<OwnerBuildingMetric[]> {
  if (buildingIds.length === 0) return []
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T, extra?: Record<string, unknown>) =>
    safeServerValue(promise, fallback, { source, route: "/admin", extra })

  const buildings = await safe(
    "ownerDashboard.buildings",
    db.building.findMany({
      where: { id: { in: buildingIds }, isActive: true },
      select: {
        id: true,
        name: true,
        address: true,
        floors: { select: { id: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    [] as Array<{ id: string; name: string; address: string; floors: Array<{ id: string }> }>,
    { buildingIds },
  )

  const activeBuildingIds = buildings.map((building) => building.id)
  if (activeBuildingIds.length === 0) return []

  const floorToBuildingId = new Map<string, string>()
  for (const building of buildings) {
    for (const floor of building.floors) floorToBuildingId.set(floor.id, building.id)
  }
  const floorIds = [...floorToBuildingId.keys()]

  const tenantInBuildingsWhere = {
    OR: [
      { space: { floorId: { in: floorIds } } },
      { tenantSpaces: { some: { space: { floorId: { in: floorIds } } } } },
      { fullFloors: { some: { buildingId: { in: activeBuildingIds } } } },
    ],
  }

  const [tenantPlacements, incomeRows, expenseRows, debtRows, spaceRows] = await Promise.all([
    safe(
      "ownerDashboard.tenantPlacements",
      db.tenant.findMany({
        where: tenantInBuildingsWhere,
        select: {
          id: true,
          space: { select: { floor: { select: { buildingId: true } } } },
          tenantSpaces: { select: { space: { select: { floor: { select: { buildingId: true } } } } } },
          fullFloors: { select: { buildingId: true } },
        },
      }),
      [] as TenantPlacementRow[],
      { buildingIds: activeBuildingIds },
    ),
    safe(
      "ownerDashboard.incomeByTenant",
      db.payment.groupBy({
        by: ["tenantId"],
        where: {
          paymentDate: { gte: from, lt: to },
          tenant: tenantInBuildingsWhere,
        },
        _sum: { amount: true },
      }),
      [] as AmountByTenantRow[],
      { buildingIds: activeBuildingIds },
    ),
    safe(
      "ownerDashboard.expensesByBuilding",
      db.expense.groupBy({
        by: ["buildingId"],
        where: { date: { gte: from, lt: to }, buildingId: { in: activeBuildingIds } },
        _sum: { amount: true },
      }),
      [] as ExpenseByBuildingRow[],
      { buildingIds: activeBuildingIds },
    ),
    safe(
      "ownerDashboard.debtByTenant",
      db.charge.groupBy({
        by: ["tenantId"],
        where: {
          isPaid: false,
          tenant: tenantInBuildingsWhere,
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      [] as DebtByTenantRow[],
      { buildingIds: activeBuildingIds },
    ),
    safe(
      "ownerDashboard.spacesByFloorAndStatus",
      db.space.groupBy({
        by: ["floorId", "status"],
        where: {
          floorId: { in: floorIds },
          kind: { not: "COMMON" },
        },
        _count: { _all: true },
        _sum: { area: true },
      }),
      [] as SpaceStatusRow[],
      { buildingIds: activeBuildingIds },
    ),
  ])

  const tenantBuildingIds = new Map<string, Set<string>>()
  const buildingTenantIds = new Map(activeBuildingIds.map((id) => [id, new Set<string>()]))
  const addTenantBuilding = (tenantId: string, buildingId: string | null | undefined) => {
    if (!buildingId || !buildingTenantIds.has(buildingId)) return
    let tenantBuildings = tenantBuildingIds.get(tenantId)
    if (!tenantBuildings) {
      tenantBuildings = new Set<string>()
      tenantBuildingIds.set(tenantId, tenantBuildings)
    }
    tenantBuildings.add(buildingId)
    buildingTenantIds.get(buildingId)?.add(tenantId)
  }

  for (const tenant of tenantPlacements) {
    addTenantBuilding(tenant.id, tenant.space?.floor.buildingId)
    for (const placement of tenant.tenantSpaces) addTenantBuilding(tenant.id, placement.space.floor.buildingId)
    for (const floor of tenant.fullFloors) addTenantBuilding(tenant.id, floor.buildingId)
  }

  const incomeByBuilding = new Map(activeBuildingIds.map((id) => [id, 0]))
  for (const row of incomeRows) {
    const amount = row._sum.amount ?? 0
    for (const buildingId of tenantBuildingIds.get(row.tenantId) ?? []) {
      incomeByBuilding.set(buildingId, (incomeByBuilding.get(buildingId) ?? 0) + amount)
    }
  }

  const debtByBuilding = new Map(activeBuildingIds.map((id) => [id, 0]))
  const debtCountByBuilding = new Map(activeBuildingIds.map((id) => [id, 0]))
  for (const row of debtRows) {
    const amount = row._sum.amount ?? 0
    const count = row._count._all ?? 0
    for (const buildingId of tenantBuildingIds.get(row.tenantId) ?? []) {
      debtByBuilding.set(buildingId, (debtByBuilding.get(buildingId) ?? 0) + amount)
      debtCountByBuilding.set(buildingId, (debtCountByBuilding.get(buildingId) ?? 0) + count)
    }
  }

  const expensesByBuilding = new Map(activeBuildingIds.map((id) => [id, 0]))
  for (const row of expenseRows) expensesByBuilding.set(row.buildingId, row._sum.amount ?? 0)

  const spaceMetrics = new Map(activeBuildingIds.map((id) => [id, {
    occupied: 0,
    totalSpaces: 0,
    occupiedArea: 0,
    vacantArea: 0,
    totalArea: 0,
  }]))
  for (const row of spaceRows) {
    const buildingId = floorToBuildingId.get(row.floorId)
    if (!buildingId) continue
    const metrics = spaceMetrics.get(buildingId)
    if (!metrics) continue
    const count = row._count._all
    const area = row._sum.area ?? 0
    metrics.totalSpaces += count
    metrics.totalArea += area
    if (row.status === "OCCUPIED") {
      metrics.occupied += count
      metrics.occupiedArea += area
    }
    if (row.status === "VACANT") metrics.vacantArea += area
  }

  return buildings.map((building) => {
    const income = incomeByBuilding.get(building.id) ?? 0
    const expenses = expensesByBuilding.get(building.id) ?? 0
    const metrics = spaceMetrics.get(building.id) ?? {
      occupied: 0,
      totalSpaces: 0,
      occupiedArea: 0,
      vacantArea: 0,
      totalArea: 0,
    }

    return {
      id: building.id,
      name: building.name,
      address: building.address,
      income,
      expenses,
      profit: income - expenses,
      debt: debtByBuilding.get(building.id) ?? 0,
      debtCount: debtCountByBuilding.get(building.id) ?? 0,
      tenantCount: buildingTenantIds.get(building.id)?.size ?? 0,
      occupied: metrics.occupied,
      totalSpaces: metrics.totalSpaces,
      occupiedArea: metrics.occupiedArea,
      vacantArea: metrics.vacantArea,
      totalArea: metrics.totalArea,
      occupancyPercent: metrics.totalArea > 0
        ? Math.round((metrics.occupiedArea / metrics.totalArea) * 100)
        : metrics.totalSpaces > 0
          ? Math.round((metrics.occupied / metrics.totalSpaces) * 100)
          : null,
    }
  })
}
