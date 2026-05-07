import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileStaffRequest, tenantInBuildingsWhere } from "@/lib/mobile-admin"

export const dynamic = "force-dynamic"

const DAY_MS = 24 * 60 * 60 * 1000

export async function GET(req: Request) {
  const result = await getMobileStaffRequest(req)
  if (!result.ok) return result.response

  const { ctx, buildingIds } = result
  const origin = new URL(req.url).origin
  const now = new Date()
  const soon = new Date(now.getTime() + 45 * DAY_MS)

  const contracts = await db.contract.findMany({
    where: {
      tenant: {
        user: { organizationId: ctx.org.id },
        ...tenantInBuildingsWhere(buildingIds),
      },
    },
    select: {
      id: true,
      tenantId: true,
      number: true,
      type: true,
      status: true,
      startDate: true,
      endDate: true,
      signedAt: true,
      sentAt: true,
      signToken: true,
      tenant: { select: { companyName: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  })

  const data = contracts.map((contract) => ({
    id: contract.id,
    tenantId: contract.tenantId,
    tenantName: contract.tenant.companyName,
    number: contract.number,
    type: contract.type,
    status: contract.status,
    startDate: contract.startDate,
    endDate: contract.endDate,
    signedAt: contract.signedAt,
    sentAt: contract.sentAt,
    webUrl: contract.signToken ? `${origin}/sign/${contract.signToken}` : `${origin}/admin/contracts`,
  }))

  return NextResponse.json({
    counters: {
      total: data.length,
      draft: data.filter((contract) => contract.status === "DRAFT").length,
      sent: data.filter((contract) => ["SENT", "VIEWED", "SIGNED_BY_TENANT"].includes(contract.status)).length,
      signed: data.filter((contract) => contract.status === "SIGNED").length,
      expiringSoon: data.filter((contract) => isExpiring(contract.endDate, now, soon)).length,
    },
    data,
  })
}

function isExpiring(endDate: Date | null, now: Date, soon: Date) {
  return !!endDate && endDate >= now && endDate <= soon
}
