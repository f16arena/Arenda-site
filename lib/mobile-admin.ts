import { db } from "@/lib/db"
import { getMobileContext, mobileError } from "@/lib/mobile-context"
import { getMobileAccessibleBuildings } from "@/lib/mobile-buildings"

const STAFF_ROLES = new Set(["OWNER", "ADMIN", "ACCOUNTANT", "FACILITY_MANAGER", "EMPLOYEE"])
const PAYMENT_ROLES = new Set(["OWNER", "ADMIN", "ACCOUNTANT"])

export async function getMobileStaffRequest(req: Request, roles = STAFF_ROLES) {
  const result = await getMobileContext(req)
  if (!result.ok) return result

  const role = result.ctx.user.role ?? ""
  if (!roles.has(role)) {
    return {
      ok: false as const,
      response: mobileError("Mobile staff endpoint is not available for this role", 403),
    }
  }

  const buildings = await getMobileAccessibleBuildings(result.ctx.user, result.ctx.org.id)
  return {
    ok: true as const,
    ctx: result.ctx,
    buildings,
    buildingIds: buildings.map((building) => building.id),
  }
}

export async function getMobilePaymentStaffRequest(req: Request) {
  return getMobileStaffRequest(req, PAYMENT_ROLES)
}

export function tenantInBuildingsWhere(buildingIds: string[]) {
  if (buildingIds.length === 0) {
    return { id: "__none__" }
  }

  return {
    OR: [
      { space: { floor: { buildingId: { in: buildingIds } } } },
      { tenantSpaces: { some: { space: { floor: { buildingId: { in: buildingIds } } } } } },
      { fullFloors: { some: { buildingId: { in: buildingIds } } } },
    ],
  }
}

export function requestInBuildingsWhere(buildingIds: string[]) {
  return {
    tenant: tenantInBuildingsWhere(buildingIds),
  }
}

export function paymentReportInBuildingsWhere(buildingIds: string[]) {
  return {
    tenant: tenantInBuildingsWhere(buildingIds),
  }
}

export async function assertMobileTenantAccess(tenantId: string, orgId: string, buildingIds: string[]) {
  const tenant = await db.tenant.findFirst({
    where: {
      id: tenantId,
      user: { organizationId: orgId },
      ...tenantInBuildingsWhere(buildingIds),
    },
    select: { id: true },
  })
  return !!tenant
}
