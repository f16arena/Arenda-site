import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileStaffRequest, tenantInBuildingsWhere } from "@/lib/mobile-admin"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const buildings = await Promise.all(result.buildings.map(async (building) => {
    const tenantWhere = tenantInBuildingsWhere([building.id])
    const [tenants, debt, requests, tasks, notices] = await Promise.all([
      db.tenant.count({ where: tenantWhere }),
      db.charge.aggregate({
        where: { isPaid: false, tenant: tenantWhere },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      db.request.count({
        where: {
          tenant: tenantWhere,
          status: { notIn: ["DONE", "CLOSED", "CANCELLED"] },
        },
      }),
      db.task.count({
        where: {
          buildingId: building.id,
          status: { notIn: ["DONE", "CLOSED", "CANCELLED"] },
        },
      }),
      db.buildingNotice.count({
        where: {
          buildingId: building.id,
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        },
      }),
    ])

    return {
      ...building,
      counters: {
        tenants,
        debtAmount: debt._sum.amount ?? 0,
        debtCharges: debt._count._all,
        openRequests: requests,
        openTasks: tasks,
        activeNotices: notices,
      },
    }
  }))

  return NextResponse.json({ data: buildings })
}
