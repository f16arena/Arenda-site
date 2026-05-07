import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileTenantRequest } from "@/lib/mobile-tenant"

export const dynamic = "force-dynamic"

const DAY_MS = 24 * 60 * 60 * 1000

export async function GET(req: Request) {
  const result = await getMobileTenantRequest(req)
  if (!result.ok) return result.response

  const { tenant } = result
  const origin = new URL(req.url).origin
  const now = new Date()
  const soon = new Date(now.getTime() + 45 * DAY_MS)

  const contracts = await db.contract.findMany({
    where: { tenantId: tenant.id },
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
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  })

  const data = contracts.map((contract) => ({
    id: contract.id,
    tenantId: contract.tenantId,
    tenantName: tenant.companyName,
    number: contract.number,
    type: contract.type,
    status: contract.status,
    startDate: contract.startDate,
    endDate: contract.endDate,
    signedAt: contract.signedAt,
    sentAt: contract.sentAt,
    webUrl: contract.signToken ? `${origin}/sign/${contract.signToken}` : null,
  }))

  return NextResponse.json({
    counters: {
      total: data.length,
      active: data.filter((contract) => !["REJECTED", "EXPIRED"].includes(contract.status)).length,
      pending: data.filter((contract) => ["SENT", "VIEWED", "SIGNED_BY_TENANT"].includes(contract.status)).length,
      signed: data.filter((contract) => contract.status === "SIGNED").length,
      expiringSoon: data.filter((contract) => isExpiring(contract.endDate, now, soon)).length,
    },
    data,
  })
}

function isExpiring(endDate: Date | null, now: Date, soon: Date) {
  return !!endDate && endDate >= now && endDate <= soon
}
