import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg, assertTenantInOrg } from "@/lib/scope-guards"
import { getCurrentBuildingId } from "@/lib/current-building"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { getTenantPrimaryBuildingId } from "@/lib/tenant-placement"
import { floorScope } from "@/lib/tenant-scope"
import { SERVICE_CHARGE_TYPE_VALUES } from "@/lib/service-charges"
import { safeServerValue } from "@/lib/server-fallback"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"

export const dynamic = "force-dynamic"

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }
  if (session.user.role === "TENANT") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
  }

  const { orgId } = await requireOrgAccess()
  const { id } = await params

  try {
    await assertTenantInOrg(id, orgId)
  } catch {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }

  const allowedCapabilities = new Set(await getAllowedCapabilityKeysForUser({
    userId: session.user.id,
    role: session.user.role,
    isPlatformOwner: !!session.user.isPlatformOwner,
    orgId,
  }))
  const canAssignTenantSpaces = allowedCapabilities.has("tenants.assignSpaces")

  const tenant = await db.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      space: {
        select: {
          floor: { select: { buildingId: true } },
        },
      },
      tenantSpaces: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: {
          space: {
            select: {
              floor: { select: { buildingId: true } },
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
        },
      },
    },
  })
  if (!tenant) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })

  const currentBuildingId = await getCurrentBuildingId().catch(() => null)
  if (currentBuildingId) await assertBuildingInOrg(currentBuildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const tenantBuildingId = getTenantPrimaryBuildingId(tenant)
  const selectedBuildingId = currentBuildingId ?? tenantBuildingId
  const visibleBuildingIds = selectedBuildingId ? [selectedBuildingId] : accessibleBuildingIds

  const url = new URL(req.url)
  const period = normalizePeriod(url.searchParams.get("period"))

  const [
    existingServiceCharges,
    tenantDocuments,
    emailLogs,
    auditLogs,
    floors,
    contracts,
    contractTotal,
    recentCharges,
    chargeTotal,
  ] = await Promise.all([
    safeServerValue(
      db.charge.findMany({
        where: {
          tenantId: id,
          period,
          type: { in: [...SERVICE_CHARGE_TYPE_VALUES] },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, amount: true, description: true },
      }),
      [],
      { source: "admin.tenant.lazy.serviceCharges", route: "/admin/tenants/[id]", orgId, userId: session.user.id, entityId: id },
    ),
    safeServerValue(
      db.tenantDocument.findMany({
        where: { tenantId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          type: true,
          name: true,
          fileUrl: true,
          storageFileId: true,
          createdAt: true,
        },
      }),
      [],
      { source: "admin.tenant.lazy.documents", route: "/admin/tenants/[id]", orgId, userId: session.user.id, entityId: id },
    ),
    safeServerValue(
      db.emailLog.findMany({
        where: { tenantId: id },
        orderBy: { sentAt: "desc" },
        take: 30,
        select: {
          id: true,
          recipient: true,
          subject: true,
          type: true,
          status: true,
          externalId: true,
          error: true,
          openedAt: true,
          openCount: true,
          sentAt: true,
        },
      }),
      [],
      { source: "admin.tenant.lazy.emailLog", route: "/admin/tenants/[id]", orgId, userId: session.user.id, entityId: id },
    ),
    safeServerValue(
      db.auditLog.findMany({
        where: {
          OR: [
            { entity: "tenant", entityId: id },
            { userId: tenant.userId },
            {
              AND: [
                { entity: { in: ["charge", "payment", "contract", "request"] } },
                { details: { contains: id } },
              ],
            },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          action: true,
          entity: true,
          userName: true,
          userRole: true,
          createdAt: true,
        },
      }),
      [],
      { source: "admin.tenant.lazy.history", route: "/admin/tenants/[id]", orgId, userId: session.user.id, entityId: id },
    ),
    canAssignTenantSpaces
      ? safeServerValue(
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
          [],
          { source: "admin.tenant.lazy.fullFloors", route: "/admin/tenants/[id]", orgId, userId: session.user.id, entityId: id },
        )
      : Promise.resolve([]),
    safeServerValue(
      db.contract.findMany({
        where: { tenantId: id, tenant: { user: { organizationId: orgId } } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          number: true,
          type: true,
          status: true,
          changeKind: true,
          appliedAt: true,
          startDate: true,
          endDate: true,
          signedByTenantAt: true,
          signedByLandlordAt: true,
          signToken: true,
        },
      }),
      [],
      { source: "admin.tenant.lazy.contracts", route: "/admin/tenants/[id]", orgId, userId: session.user.id, entityId: id },
    ),
    safeServerValue(
      db.contract.count({ where: { tenantId: id, tenant: { user: { organizationId: orgId } } } }),
      0,
      { source: "admin.tenant.lazy.contractCount", route: "/admin/tenants/[id]", orgId, userId: session.user.id, entityId: id },
    ),
    safeServerValue(
      db.charge.findMany({
        where: { tenantId: id, tenant: { user: { organizationId: orgId } } },
        orderBy: { createdAt: "desc" },
        take: 6,
        select: {
          id: true,
          period: true,
          type: true,
          amount: true,
          isPaid: true,
        },
      }),
      [],
      { source: "admin.tenant.lazy.recentCharges", route: "/admin/tenants/[id]", orgId, userId: session.user.id, entityId: id },
    ),
    safeServerValue(
      db.charge.count({ where: { tenantId: id, tenant: { user: { organizationId: orgId } } } }),
      0,
      { source: "admin.tenant.lazy.chargeCount", route: "/admin/tenants/[id]", orgId, userId: session.user.id, entityId: id },
    ),
  ])

  return NextResponse.json({
    serviceCharges: existingServiceCharges,
    documents: tenantDocuments,
    emailLogs,
    history: auditLogs,
    fullFloors: {
      floors,
      currentFloors: tenant.fullFloors.map((floor) => ({
        id: floor.id,
        name: floor.name,
        fixedMonthlyRent: floor.fixedMonthlyRent,
      })),
    },
    contracts: {
      items: contracts,
      total: contractTotal,
    },
    recentCharges: {
      items: recentCharges,
      total: chargeTotal,
    },
  })
}

function normalizePeriod(value: string | null) {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value
  return new Date().toISOString().slice(0, 7)
}
