import type { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { getMobileContext, mobileError, type MobileUserContext } from "@/lib/mobile-context"
import { calculateTenantMonthlyRent, calculateTenantRatePerSqm } from "@/lib/rent"
import { formatTenantPlacement, getTenantAreaTotal, getTenantPrimaryBuildingId } from "@/lib/tenant-placement"

const MOBILE_TENANT_ARGS = {
  select: {
    id: true,
    userId: true,
    companyName: true,
    legalType: true,
    bin: true,
    iin: true,
    customRate: true,
    fixedMonthlyRent: true,
    contractStart: true,
    contractEnd: true,
    paymentDueDay: true,
    space: {
      select: {
        id: true,
        number: true,
        area: true,
        floor: {
          select: {
            id: true,
            name: true,
            ratePerSqm: true,
            buildingId: true,
            building: { select: { id: true, name: true, address: true } },
          },
        },
      },
    },
    tenantSpaces: {
      orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }],
      select: {
        isPrimary: true,
        space: {
          select: {
            id: true,
            number: true,
            area: true,
            floor: {
              select: {
                id: true,
                name: true,
                ratePerSqm: true,
                buildingId: true,
                building: { select: { id: true, name: true, address: true } },
              },
            },
          },
        },
      },
    },
    fullFloors: {
      select: {
        id: true,
        name: true,
        totalArea: true,
        fixedMonthlyRent: true,
        buildingId: true,
        building: { select: { id: true, name: true, address: true } },
      },
    },
  },
} satisfies Prisma.TenantDefaultArgs

export type MobileTenant = Prisma.TenantGetPayload<typeof MOBILE_TENANT_ARGS>

export async function getMobileTenantRequest(req: Request) {
  const result = await getMobileContext(req)
  if (!result.ok) return result

  if (result.ctx.user.role !== "TENANT") {
    return {
      ok: false as const,
      response: mobileError("Tenant mobile endpoint is available only for tenant users", 403),
    }
  }

  const tenant = await getMobileTenant(result.ctx)
  if (!tenant) {
    return {
      ok: false as const,
      response: mobileError("Tenant profile not found", 404),
    }
  }

  return { ok: true as const, ctx: result.ctx, tenant }
}

export async function getMobileTenant(ctx: MobileUserContext) {
  return db.tenant.findFirst({
    where: {
      userId: ctx.user.id,
      user: { organizationId: ctx.org.id, isActive: true },
    },
    ...MOBILE_TENANT_ARGS,
  })
}

export async function getMobileTenantScope(tenant: MobileTenant) {
  const directSpaces = [
    tenant.space,
    ...tenant.tenantSpaces.map((item) => item.space),
  ].filter(Boolean) as NonNullable<MobileTenant["space"]>[]

  const floorSpaces = tenant.fullFloors.length > 0
    ? await db.space.findMany({
        where: { floorId: { in: tenant.fullFloors.map((floor) => floor.id) } },
        select: {
          id: true,
          number: true,
          area: true,
          floor: {
            select: {
              id: true,
              name: true,
              ratePerSqm: true,
              buildingId: true,
              building: { select: { id: true, name: true, address: true } },
            },
          },
        },
        orderBy: { number: "asc" },
      })
    : []

  const spaces = uniqueBy([...directSpaces, ...floorSpaces], (space) => space.id)
  const buildings = uniqueBy([
    ...spaces.map((space) => space.floor.building),
    ...tenant.fullFloors.map((floor) => floor.building),
  ], (building) => building.id)

  return {
    spaces,
    spaceIds: spaces.map((space) => space.id),
    buildings,
    buildingIds: buildings.map((building) => building.id),
  }
}

export function getMobileTenantSummary(tenant: MobileTenant) {
  return {
    id: tenant.id,
    companyName: tenant.companyName,
    legalType: tenant.legalType,
    bin: tenant.bin,
    iin: tenant.iin,
    contractStart: tenant.contractStart,
    contractEnd: tenant.contractEnd,
    paymentDueDay: tenant.paymentDueDay,
    placement: formatTenantPlacement(tenant, {
      includeFloorName: false,
      emptyLabel: "помещение по договору",
    }),
    area: getTenantAreaTotal(tenant),
    monthlyRent: calculateTenantMonthlyRent(tenant),
    ratePerSqm: calculateTenantRatePerSqm(tenant) ?? 0,
    primaryBuildingId: getTenantPrimaryBuildingId(tenant),
  }
}

export function getMobilePaymentPurpose(tenant: MobileTenant, period = new Date().toISOString().slice(0, 7)) {
  const placement = formatTenantPlacement(tenant, {
    includeFloorName: false,
    emptyLabel: "помещение по договору",
  })
  return `Аренда ${placement}, ${tenant.companyName}, период ${period}`
}

export function currentPeriod() {
  return new Date().toISOString().slice(0, 7)
}

export function parsePositiveAmount(value: unknown) {
  const amount = Number(String(value ?? "").replace(/\s/g, "").replace(",", "."))
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.round(amount * 100) / 100
}

export function parseMobileDate(value: unknown) {
  const raw = String(value ?? "").trim()
  if (!raw) return new Date()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null

  const date = new Date(`${raw}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function uniqueBy<T>(items: T[], key: (item: T) => string) {
  return [...new Map(items.map((item) => [key(item), item])).values()]
}
