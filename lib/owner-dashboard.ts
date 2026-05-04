import { db } from "@/lib/db"

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

  const buildings = await db.building.findMany({
    where: { id: { in: buildingIds }, isActive: true },
    select: {
      id: true,
      name: true,
      address: true,
      floors: { select: { id: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  const rows = await Promise.all(
    buildings.map(async (building) => {
      const floorIds = building.floors.map((floor) => floor.id)
      const buildingTenantWhere = {
        OR: [
          { space: { floorId: { in: floorIds } } },
          { fullFloors: { some: { buildingId: building.id } } },
        ],
      }

      const [
        incomeAgg,
        expenseAgg,
        debtAgg,
        tenantCount,
        spacesByStatus,
        totalAreaAgg,
        occupiedAreaAgg,
        vacantAreaAgg,
      ] = await Promise.all([
        db.payment.aggregate({
          where: {
            paymentDate: { gte: from, lt: to },
            tenant: buildingTenantWhere,
          },
          _sum: { amount: true },
        }).catch(() => ({ _sum: { amount: 0 } })),
        db.expense.aggregate({
          where: { date: { gte: from, lt: to }, buildingId: building.id },
          _sum: { amount: true },
        }).catch(() => ({ _sum: { amount: 0 } })),
        db.charge.aggregate({
          where: {
            isPaid: false,
            tenant: buildingTenantWhere,
          },
          _sum: { amount: true },
          _count: { _all: true },
        }).catch(() => ({ _sum: { amount: 0 }, _count: { _all: 0 } })),
        db.tenant.count({ where: buildingTenantWhere }).catch(() => 0),
        db.space.groupBy({
          by: ["status"],
          where: {
            floorId: { in: floorIds },
            kind: { not: "COMMON" },
          },
          _count: { _all: true },
        }).catch(() => [] as Array<{ status: string; _count: { _all: number } }>),
        db.space.aggregate({
          where: {
            floorId: { in: floorIds },
            kind: { not: "COMMON" },
          },
          _sum: { area: true },
        }).catch(() => ({ _sum: { area: 0 } })),
        db.space.aggregate({
          where: {
            floorId: { in: floorIds },
            kind: { not: "COMMON" },
            status: "OCCUPIED",
          },
          _sum: { area: true },
        }).catch(() => ({ _sum: { area: 0 } })),
        db.space.aggregate({
          where: {
            floorId: { in: floorIds },
            kind: { not: "COMMON" },
            status: "VACANT",
          },
          _sum: { area: true },
        }).catch(() => ({ _sum: { area: 0 } })),
      ])

      const spaceStatusRows = spacesByStatus as Array<{ status: string; _count: { _all: number } }>
      const occupied = spaceStatusRows.find((space) => space.status === "OCCUPIED")?._count._all ?? 0
      const totalSpaces = spaceStatusRows.reduce((sum, space) => sum + space._count._all, 0)
      const income = incomeAgg._sum.amount ?? 0
      const expenses = expenseAgg._sum.amount ?? 0
      const totalArea = totalAreaAgg._sum.area ?? 0
      const occupiedArea = occupiedAreaAgg._sum.area ?? 0
      const vacantArea = vacantAreaAgg._sum.area ?? 0

      return {
        id: building.id,
        name: building.name,
        address: building.address,
        income,
        expenses,
        profit: income - expenses,
        debt: debtAgg._sum.amount ?? 0,
        debtCount: debtAgg._count._all ?? 0,
        tenantCount,
        occupied,
        totalSpaces,
        occupiedArea,
        vacantArea,
        totalArea,
        occupancyPercent: totalArea > 0
          ? Math.round((occupiedArea / totalArea) * 100)
          : totalSpaces > 0
            ? Math.round((occupied / totalSpaces) * 100)
            : null,
      }
    }),
  )

  return rows
}
