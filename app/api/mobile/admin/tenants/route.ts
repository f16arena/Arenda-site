import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileStaffRequest, tenantInBuildingsWhere } from "@/lib/mobile-admin"

export const dynamic = "force-dynamic"

const CLOSED_REQUEST_STATUSES = ["DONE", "CLOSED", "CANCELLED"]
const INACTIVE_CONTRACT_STATUSES = ["REJECTED", "EXPIRED"]
const DAY_MS = 24 * 60 * 60 * 1000

export async function GET(req: Request) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const { ctx, buildingIds } = result
  const now = new Date()
  const soon = new Date(now.getTime() + 45 * DAY_MS)

  const tenants = await db.tenant.findMany({
    where: {
      user: { organizationId: ctx.org.id },
      ...tenantInBuildingsWhere(buildingIds),
    },
    select: {
      id: true,
      companyName: true,
      legalType: true,
      bin: true,
      iin: true,
      fixedMonthlyRent: true,
      customRate: true,
      contractStart: true,
      contractEnd: true,
      space: {
        select: {
          number: true,
          area: true,
          floor: { select: { name: true, building: { select: { name: true } } } },
        },
      },
      tenantSpaces: {
        select: {
          space: {
            select: {
              number: true,
              area: true,
              floor: { select: { name: true, building: { select: { name: true } } } },
            },
          },
        },
      },
      fullFloors: {
        select: {
          name: true,
          totalArea: true,
          building: { select: { name: true } },
          spaces: { select: { area: true } },
        },
      },
      _count: { select: { documents: true } },
    },
    orderBy: { companyName: "asc" },
    take: 100,
  })

  const tenantIds = tenants.map((tenant) => tenant.id)
  const tenantIdFilter = tenantIds.length > 0 ? tenantIds : ["__none__"]
  const [debtRows, overdueRows, requestRows, contractRows] = await Promise.all([
    db.charge.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIdFilter }, isPaid: false },
      _sum: { amount: true },
    }),
    db.charge.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIdFilter }, isPaid: false, dueDate: { lt: now } },
      _sum: { amount: true },
    }),
    db.request.groupBy({
      by: ["tenantId"],
      where: { tenantId: { in: tenantIdFilter }, status: { notIn: CLOSED_REQUEST_STATUSES } },
      _count: { _all: true },
    }),
    db.contract.findMany({
      where: { tenantId: { in: tenantIdFilter } },
      select: { tenantId: true, status: true, endDate: true },
    }),
  ])

  const debts = new Map(debtRows.map((row) => [row.tenantId, row._sum.amount ?? 0]))
  const overdueDebts = new Map(overdueRows.map((row) => [row.tenantId, row._sum.amount ?? 0]))
  const requests = new Map(requestRows.map((row) => [row.tenantId, row._count._all]))
  const contracts = new Map<string, Array<{ status: string; endDate: Date | null }>>()
  for (const contract of contractRows) {
    const list = contracts.get(contract.tenantId) ?? []
    list.push({ status: contract.status, endDate: contract.endDate })
    contracts.set(contract.tenantId, list)
  }

  const data = tenants.map((tenant) => {
    const tenantContracts = contracts.get(tenant.id) ?? []
    const totalDebt = debts.get(tenant.id) ?? 0
    const overdueDebt = overdueDebts.get(tenant.id) ?? 0
    const expiringSoon = tenantContracts.filter((contract) => isExpiring(contract.endDate, now, soon)).length

    return {
      id: tenant.id,
      companyName: tenant.companyName,
      legalType: tenant.legalType,
      bin: tenant.bin,
      iin: tenant.iin,
      placement: tenantPlacement(tenant),
      area: tenantArea(tenant),
      monthlyRent: tenant.fixedMonthlyRent ?? tenant.customRate ?? 0,
      totalDebt,
      overdueDebt,
      activeRequests: requests.get(tenant.id) ?? 0,
      documents: tenant._count.documents,
      contractStart: tenant.contractStart,
      contractEnd: tenant.contractEnd,
      contracts: {
        total: tenantContracts.length,
        active: tenantContracts.filter((contract) => !INACTIVE_CONTRACT_STATUSES.includes(contract.status)).length,
        signed: tenantContracts.filter((contract) => contract.status === "SIGNED").length,
        expiringSoon,
      },
    }
  })

  return NextResponse.json({
    counters: {
      total: data.length,
      withDebt: data.filter((tenant) => tenant.totalDebt > 0).length,
      debtAmount: data.reduce((sum, tenant) => sum + tenant.totalDebt, 0),
      expiringContracts: data.reduce((sum, tenant) => sum + tenant.contracts.expiringSoon, 0),
    },
    data,
  })
}

function isExpiring(endDate: Date | null, now: Date, soon: Date) {
  return !!endDate && endDate >= now && endDate <= soon
}

type TenantForList = {
  space: {
    number: string
    area: number
    floor: { name: string; building: { name: string } }
  } | null
  tenantSpaces: Array<{
    space: {
      number: string
      area: number
      floor: { name: string; building: { name: string } }
    }
  }>
  fullFloors: Array<{
    name: string
    totalArea: number | null
    building: { name: string }
    spaces: Array<{ area: number }>
  }>
}

function tenantPlacement(tenant: TenantForList) {
  const labels: string[] = []

  if (tenant.space) {
    labels.push(`${tenant.space.floor.building.name}, ${tenant.space.floor.name}, каб. ${tenant.space.number}`)
  }

  for (const item of tenant.tenantSpaces.slice(0, 2)) {
    labels.push(`${item.space.floor.building.name}, ${item.space.floor.name}, каб. ${item.space.number}`)
  }

  for (const floor of tenant.fullFloors.slice(0, 2)) {
    labels.push(`${floor.building.name}, ${floor.name}`)
  }

  const hiddenCount = Math.max(0, tenant.tenantSpaces.length + tenant.fullFloors.length + (tenant.space ? 1 : 0) - labels.length)
  return labels.length > 0 ? `${labels.join(" · ")}${hiddenCount ? ` +${hiddenCount}` : ""}` : "Площадь не назначена"
}

function tenantArea(tenant: TenantForList) {
  const direct = tenant.space?.area ?? 0
  const spaces = tenant.tenantSpaces.reduce((sum, item) => sum + item.space.area, 0)
  const floors = tenant.fullFloors.reduce((sum, floor) => {
    const floorArea = floor.totalArea ?? floor.spaces.reduce((nestedSum, space) => nestedSum + space.area, 0)
    return sum + floorArea
  }, 0)
  return Math.round((direct + spaces + floors) * 10) / 10
}
