import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { getCurrentBuildingId } from "@/lib/current-building"
import { getOwnerBuildingMetrics } from "@/lib/owner-dashboard"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { safeServerValue } from "@/lib/server-fallback"
import { Prisma } from "@/app/generated/prisma/client"

export const dynamic = "force-dynamic"

type MonthlyTotalRow = {
  period: string
  amount: number | null
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }
  if (session.user.role === "TENANT") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
  }

  const { orgId } = await requireOrgAccess()
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, {
      source,
      route: "/admin",
      orgId,
      userId: session.user.id,
    })

  const buildingId = await getCurrentBuildingId().catch(() => null)
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const visibleBuildingIds = buildingId ? [buildingId] : accessibleBuildingIds

  if (visibleBuildingIds.length === 0) {
    return NextResponse.json(
      {
        months: [],
        buildingBreakdown: [],
        recentRequests: [],
        recentTasks: [],
        topTenants: [],
      },
      {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
        },
      },
    )
  }

  const floorIds = await safe(
    "admin.dashboard.lazy.floorIds",
    db.floor.findMany({
      where: { buildingId: { in: visibleBuildingIds } },
      select: { id: true },
    }).then((floors) => floors.map((floor) => floor.id)),
    [] as string[],
  )

  const tenantWhereInBuilding: Prisma.TenantWhereInput = {
    user: { organizationId: orgId },
    OR: [
      { space: { floorId: { in: floorIds } } },
      { tenantSpaces: { some: { space: { floorId: { in: floorIds } } } } },
      { fullFloors: { some: { buildingId: { in: visibleBuildingIds } } } },
    ],
  }

  const now = new Date()
  const pastMonths: { period: string; start: Date; end: Date }[] = []
  for (let i = -5; i <= 0; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    pastMonths.push({
      period: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      start: new Date(d.getFullYear(), d.getMonth(), 1),
      end: new Date(d.getFullYear(), d.getMonth() + 1, 1),
    })
  }

  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const historyStart = pastMonths[0]?.start ?? currentMonthStart
  const historyEnd = pastMonths[pastMonths.length - 1]?.end ?? nextMonthStart
  const floorIdList = floorIds.length > 0 ? Prisma.join(floorIds) : Prisma.sql`NULL`
  const buildingIdList = Prisma.join(visibleBuildingIds)

  const [
    recentRequests,
    recentTasks,
    debtsByTenant,
    topTenants,
    paymentRows,
    expenseRows,
    buildingBreakdown,
  ] = await Promise.all([
    safe(
      "admin.dashboard.lazy.recentRequests",
      db.request.findMany({
        where: {
          status: { in: ["NEW", "IN_PROGRESS"] },
          tenant: tenantWhereInBuilding,
        },
        select: { id: true, title: true, status: true },
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
      [] as Array<{ id: string; title: string; status: string }>,
    ),
    safe(
      "admin.dashboard.lazy.recentTasks",
      db.task.findMany({
        where: {
          status: { in: ["NEW", "IN_PROGRESS"] },
          OR: [
            { buildingId: { in: visibleBuildingIds } },
            { buildingId: null, createdBy: { organizationId: orgId } },
          ],
        },
        select: { id: true, title: true, status: true },
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
      [] as Array<{ id: string; title: string; status: string }>,
    ),
    safe(
      "admin.dashboard.lazy.debtsByTenant",
      db.charge.groupBy({
        by: ["tenantId"],
        where: {
          isPaid: false,
          tenant: tenantWhereInBuilding,
        },
        _sum: { amount: true },
      }),
      [] as Array<{ tenantId: string; _sum: { amount: number | null } }>,
    ),
    safe(
      "admin.dashboard.lazy.topTenants",
      db.tenant.findMany({
        where: tenantWhereInBuilding,
        select: {
          id: true,
          companyName: true,
          space: { select: { number: true } },
          tenantSpaces: {
            select: { space: { select: { number: true } } },
            take: 3,
            orderBy: { createdAt: "asc" },
          },
          fullFloors: {
            select: { number: true, name: true },
            take: 3,
            orderBy: { number: "asc" },
          },
        },
        take: 6,
        orderBy: { createdAt: "desc" },
      }),
      [] as Array<{
        id: string
        companyName: string
        space: { number: string } | null
        tenantSpaces: { space: { number: string } }[]
        fullFloors: { number: number; name: string }[]
      }>,
    ),
    safe(
      "admin.dashboard.lazy.monthlyPaymentsGrouped",
      db.$queryRaw<MonthlyTotalRow[]>(Prisma.sql`
        SELECT
          to_char(date_trunc('month', p.payment_date), 'YYYY-MM') AS period,
          COALESCE(SUM(p.amount), 0)::double precision AS amount
        FROM payments p
        JOIN tenants t ON t.id = p.tenant_id
        JOIN users u ON u.id = t.user_id
        WHERE u.organization_id = ${orgId}
          AND p.payment_date >= ${historyStart}
          AND p.payment_date < ${historyEnd}
          AND (
            t.space_id IN (
              SELECT s.id
              FROM spaces s
              WHERE s.floor_id IN (${floorIdList})
            )
            OR EXISTS (
              SELECT 1
              FROM tenant_spaces ts
              JOIN spaces s ON s.id = ts.space_id
              WHERE ts.tenant_id = t.id
                AND s.floor_id IN (${floorIdList})
            )
            OR EXISTS (
              SELECT 1
              FROM floors f
              WHERE f.full_floor_tenant_id = t.id
                AND f.building_id IN (${buildingIdList})
            )
          )
        GROUP BY 1
        ORDER BY 1
      `),
      [] as MonthlyTotalRow[],
    ),
    safe(
      "admin.dashboard.lazy.monthlyExpensesGrouped",
      db.$queryRaw<MonthlyTotalRow[]>(Prisma.sql`
        SELECT
          to_char(date_trunc('month', e.date), 'YYYY-MM') AS period,
          COALESCE(SUM(e.amount), 0)::double precision AS amount
        FROM expenses e
        WHERE e.building_id IN (${buildingIdList})
          AND e.date >= ${historyStart}
          AND e.date < ${historyEnd}
        GROUP BY 1
        ORDER BY 1
      `),
      [] as MonthlyTotalRow[],
    ),
    buildingId
      ? Promise.resolve([])
      : safe(
          "admin.dashboard.lazy.buildingBreakdown",
          getOwnerBuildingMetrics({
            buildingIds: visibleBuildingIds,
            from: currentMonthStart,
            to: nextMonthStart,
          }),
          [],
        ),
  ])

  const paymentsByPeriod = new Map(paymentRows.map((row) => [row.period, row.amount ?? 0]))
  const expensesByPeriod = new Map(expenseRows.map((row) => [row.period, row.amount ?? 0]))
  const debtByTenant = new Map(debtsByTenant.map((row) => [row.tenantId, row._sum.amount ?? 0]))

  return NextResponse.json(
    {
      months: pastMonths.map((month) => ({
        period: month.period,
        income: paymentsByPeriod.get(month.period) ?? 0,
        expense: expensesByPeriod.get(month.period) ?? 0,
      })),
      buildingBreakdown,
      recentRequests,
      recentTasks,
      topTenants: topTenants.map((tenant) => ({
        ...tenant,
        debt: debtByTenant.get(tenant.id) ?? 0,
      })),
    },
    {
      headers: {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=60",
      },
    },
  )
}
