import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireApiKey, ApiKeyError } from "@/lib/api-keys"
import { chargeScope } from "@/lib/tenant-scope"
import { headers } from "next/headers"
import { checkRateLimit, getClientKey } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

/**
 * GET /api/v1/charges?api_key=ck_xxx
 *   Параметры:
 *     period=YYYY-MM
 *     unpaid=true     - только неоплаченные
 *     tenantId=xxx
 *     limit / offset
 */
export async function GET(req: Request) {
  try {
    const auth = await requireApiKey(req, "READ")
    const reqHeaders = await headers()
    const rl = checkRateLimit(getClientKey(reqHeaders, `apikey:${auth.apiKeyId}`), {
      max: 100,
      window: 60_000,
    })
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Rate limit. Try in ${rl.retryAfterSec}s.` },
        { status: 429 },
      )
    }

    const url = new URL(req.url)
    const period = url.searchParams.get("period")
    const unpaid = url.searchParams.get("unpaid") === "true"
    const tenantId = url.searchParams.get("tenantId")
    const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") ?? "100")))
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0"))

    const where: Record<string, unknown> = { ...chargeScope(auth.organizationId) }
    if (period && /^\d{4}-(0[1-9]|1[0-2])$/.test(period)) where.period = period
    if (unpaid) where.isPaid = false
    if (tenantId) where.tenantId = tenantId

    const [items, total] = await Promise.all([
      db.charge.findMany({
        where,
        select: {
          id: true,
          tenantId: true,
          period: true,
          type: true,
          amount: true,
          isPaid: true,
          dueDate: true,
          createdAt: true,
          tenant: { select: { companyName: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.charge.count({ where }),
    ])

    return NextResponse.json({
      data: items,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    })
  } catch (e) {
    if (e instanceof ApiKeyError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode })
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
