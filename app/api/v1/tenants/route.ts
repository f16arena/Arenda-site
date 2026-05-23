import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireApiKey, ApiKeyError } from "@/lib/api-keys"
import { tenantScope } from "@/lib/tenant-scope"
import { headers } from "next/headers"
import { checkRateLimit, getClientKey } from "@/lib/rate-limit"
import { isOrgFeatureAvailable } from "@/lib/capabilities"

export const dynamic = "force-dynamic"

/**
 * GET /api/v1/tenants
 *
 * Параметры запроса:
 *   limit       — 1..500, default 100
 *   offset      — default 0
 *   blacklisted — "true" / "false" (опциональный фильтр по чёрному списку)
 *
 * Ответ:
 *   { data: Tenant[], total: number, limit: number, offset: number }
 *
 * Авторизация: Bearer ApiKey (создаётся в /admin/api-keys)
 */
export async function GET(req: Request) {
  // Rate-limit: 100 запросов в минуту с одного API-ключа
  try {
    const auth = await requireApiKey(req, "READ")
    // Гейт по фиче `api` — публичный REST доступен только Business/Enterprise.
    const apiAllowed = await isOrgFeatureAvailable(auth.organizationId, "api")
    if (!apiAllowed) {
      return NextResponse.json(
        { error: "Публичный API доступен на тарифе Business и выше" },
        { status: 403 },
      )
    }
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
    const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") ?? "100", 10) || 100))
    const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0)
    const blacklisted = url.searchParams.get("blacklisted")

    const where = {
      ...tenantScope(auth.organizationId),
      ...(blacklisted === "true" ? { blacklistedAt: { not: null } } : {}),
      ...(blacklisted === "false" ? { blacklistedAt: null } : {}),
    }

    const [items, total] = await Promise.all([
      db.tenant.findMany({
        where,
        select: {
          id: true,
          companyName: true,
          legalType: true,
          bin: true,
          iin: true,
          bankName: true,
          iik: true,
          bik: true,
          contractStart: true,
          contractEnd: true,
          createdAt: true,
          blacklistedAt: true,
          user: { select: { name: true, email: true, phone: true } },
          space: {
            select: {
              number: true,
              area: true,
              floor: { select: { name: true, building: { select: { name: true, address: true } } } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.tenant.count({ where }),
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
