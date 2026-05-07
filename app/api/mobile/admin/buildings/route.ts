import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileStaffRequest, tenantInBuildingsWhere } from "@/lib/mobile-admin"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { formatTenantPlacement, getTenantAreaTotal } from "@/lib/tenant-placement"

export const dynamic = "force-dynamic"

const CLOSED_STATUSES = ["DONE", "CLOSED", "CANCELLED"]

export async function GET(req: Request) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const buildings = await Promise.all(result.buildings.map(async (building) => {
    const tenantWhere = tenantInBuildingsWhere([building.id])
    const now = new Date()
    const [tenants, debt, requests, tasks, notices, floorRows, recentTenants, activeNotices] = await Promise.all([
      db.tenant.count({ where: tenantWhere }),
      db.charge.aggregate({
        where: { isPaid: false, tenant: tenantWhere },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      db.request.count({
        where: {
          tenant: tenantWhere,
          status: { notIn: CLOSED_STATUSES },
        },
      }),
      db.task.count({
        where: {
          buildingId: building.id,
          status: { notIn: CLOSED_STATUSES },
        },
      }),
      db.buildingNotice.count({
        where: {
          buildingId: building.id,
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
      }),
      db.floor.findMany({
        where: { buildingId: building.id },
        select: {
          id: true,
          name: true,
          number: true,
          totalArea: true,
          fixedMonthlyRent: true,
          fullFloorTenantId: true,
          spaces: {
            where: { kind: "RENTABLE" },
            select: {
              id: true,
              area: true,
              status: true,
            },
          },
        },
        orderBy: { number: "asc" },
      }),
      db.tenant.findMany({
        where: tenantWhere,
        select: {
          id: true,
          companyName: true,
          contractEnd: true,
          paymentDueDay: true,
          fixedMonthlyRent: true,
          customRate: true,
          space: {
            select: {
              number: true,
              area: true,
              floor: { select: { name: true, ratePerSqm: true, buildingId: true } },
            },
          },
          tenantSpaces: {
            select: {
              space: {
                select: {
                  number: true,
                  area: true,
                  floor: { select: { name: true, ratePerSqm: true, buildingId: true } },
                },
              },
            },
          },
          fullFloors: {
            select: {
              name: true,
              totalArea: true,
              fixedMonthlyRent: true,
              buildingId: true,
            },
          },
        },
        orderBy: { companyName: "asc" },
        take: 6,
      }),
      db.buildingNotice.findMany({
        where: {
          buildingId: building.id,
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        },
        select: {
          id: true,
          buildingId: true,
          type: true,
          severity: true,
          title: true,
          message: true,
          startsAt: true,
          endsAt: true,
          sentAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ])

    const floors = floorRows.map((floor) => {
      const totalArea = floor.spaces.reduce((sum, space) => sum + space.area, 0)
      const occupiedSpaces = floor.spaces.filter((space) => floor.fullFloorTenantId || space.status === "OCCUPIED")
      const vacantSpaces = floor.fullFloorTenantId ? [] : floor.spaces.filter((space) => space.status === "VACANT")
      const occupiedArea = occupiedSpaces.reduce((sum, space) => sum + space.area, 0)
      const vacantArea = vacantSpaces.reduce((sum, space) => sum + space.area, 0)

      return {
        id: floor.id,
        name: floor.name,
        number: floor.number,
        totalArea: roundArea(totalArea || floor.totalArea || 0),
        fixedMonthlyRent: floor.fixedMonthlyRent,
        occupiedArea: roundArea(occupiedArea),
        vacantArea: roundArea(vacantArea),
        occupiedSpaces: occupiedSpaces.length,
        vacantSpaces: vacantSpaces.length,
        spaces: floor.spaces.length,
        occupancyPercent: percent(occupiedArea, totalArea || floor.totalArea || 0),
      }
    })
    const totalArea = floors.reduce((sum, floor) => sum + floor.totalArea, 0)
    const occupiedArea = floors.reduce((sum, floor) => sum + floor.occupiedArea, 0)
    const vacantArea = floors.reduce((sum, floor) => sum + floor.vacantArea, 0)

    return {
      ...building,
      counters: {
        tenants,
        debtAmount: debt._sum.amount ?? 0,
        debtCharges: debt._count._all,
        openRequests: requests,
        openTasks: tasks,
        activeNotices: notices,
        totalArea: roundArea(totalArea),
        occupiedArea: roundArea(occupiedArea),
        vacantArea: roundArea(vacantArea),
        occupancyPercent: percent(occupiedArea, totalArea),
      },
      floors,
      recentTenants: recentTenants.map((tenant) => ({
        id: tenant.id,
        companyName: tenant.companyName,
        placement: formatTenantPlacement(tenant, { emptyLabel: "Площадь не назначена" }),
        area: roundArea(getTenantAreaTotal(tenant)),
        monthlyRent: calculateTenantMonthlyRent(tenant),
        paymentDueDay: tenant.paymentDueDay,
        contractEnd: tenant.contractEnd,
      })),
      notices: activeNotices,
    }
  }))

  return NextResponse.json({ data: buildings })
}

function roundArea(value: number) {
  return Math.round(value * 10) / 10
}

function percent(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0
  return Math.round((value / total) * 100)
}
