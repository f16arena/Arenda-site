import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import { tenantScope } from "@/lib/tenant-scope"

export const dynamic = "force-dynamic"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 80

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }

  const { orgId } = await requireOrgAccess()
  const allowed = await getAllowedCapabilityKeysForUser({
    userId: session.user.id,
    role: session.user.role,
    isPlatformOwner: !!session.user.isPlatformOwner,
    orgId,
  })

  if (!allowed.includes("spaces.assignTenant")) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
  }

  const url = new URL(req.url)
  const buildingId = (url.searchParams.get("buildingId") ?? "").trim()
  if (!buildingId) {
    return NextResponse.json({ error: "buildingId is required" }, { status: 400 })
  }
  await assertBuildingInOrg(buildingId, orgId)

  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80)
  const limit = clampNumber(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT)

  const tenants = await db.tenant.findMany({
    where: {
      AND: [
        tenantScope(orgId),
        { fullFloors: { none: {} } },
        {
          OR: [
            { spaceId: null },
            { space: { floor: { buildingId } } },
            { tenantSpaces: { some: { space: { floor: { buildingId } } } } },
          ],
        },
        {
          tenantSpaces: {
            none: { space: { floor: { buildingId: { not: buildingId } } } },
          },
        },
        q
          ? {
              OR: [
                { companyName: { contains: q, mode: "insensitive" } },
                { bin: { contains: q } },
                { iin: { contains: q } },
              ],
            }
          : {},
      ],
    },
    orderBy: { companyName: "asc" },
    select: {
      id: true,
      companyName: true,
      space: {
        select: {
          number: true,
          floor: { select: { buildingId: true, name: true } },
        },
      },
      tenantSpaces: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: {
          space: {
            select: {
              number: true,
              floor: { select: { buildingId: true, name: true } },
            },
          },
        },
        take: 4,
      },
    },
    take: limit,
  })

  return NextResponse.json({
    tenants: tenants.map((tenant) => {
      const placements = new Set<string>()
      if (tenant.space?.floor.buildingId === buildingId) placements.add(`Каб. ${tenant.space.number}`)
      for (const item of tenant.tenantSpaces) {
        if (item.space.floor.buildingId === buildingId) placements.add(`Каб. ${item.space.number}`)
      }
      return {
        id: tenant.id,
        companyName: tenant.companyName,
        placement: placements.size > 0 ? Array.from(placements).join(", ") : null,
      }
    }),
    limit,
  })
}

function clampNumber(raw: string | null, fallback: number, max: number) {
  const value = Number(raw ?? fallback)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.min(Math.floor(value), max)
}
