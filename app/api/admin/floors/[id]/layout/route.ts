import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { isLayoutV2 } from "@/lib/floor-layout"
import { requireOrgAccess } from "@/lib/org"
import { floorScope } from "@/lib/tenant-scope"
import { parseSpacePhotos } from "@/lib/space-photos"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }
  if (session.user.role === "TENANT") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
  }

  const { orgId } = await requireOrgAccess()
  const { id } = await params

  const floor = await db.floor.findFirst({
    where: {
      AND: [
        floorScope(orgId),
        { id },
      ],
    },
    select: {
      id: true,
      name: true,
      number: true,
      ratePerSqm: true,
      layoutJson: true,
      spaces: {
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          area: true,
          status: true,
          kind: true,
          description: true,
          photos: true,
          tenant: {
            select: {
              id: true,
              companyName: true,
              contractEnd: true,
            },
          },
          tenantSpaces: {
            select: {
              tenant: {
                select: {
                  id: true,
                  companyName: true,
                  contractEnd: true,
                },
              },
            },
            take: 1,
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  })

  if (!floor) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }

  const tenantIds = Array.from(new Set(floor.spaces.flatMap((space) => {
    const tenant = space.tenantSpaces[0]?.tenant ?? space.tenant
    return tenant ? [tenant.id] : []
  })))
  const debtRows = tenantIds.length > 0
    ? await db.charge.groupBy({
        by: ["tenantId"],
        where: { tenantId: { in: tenantIds }, isPaid: false },
        _sum: { amount: true },
      })
    : []
  const debtByTenant = new Map(debtRows.map((row) => [row.tenantId, row._sum.amount ?? 0]))

  let layout = null
  if (floor.layoutJson) {
    try {
      const parsed = JSON.parse(floor.layoutJson)
      if (isLayoutV2(parsed)) layout = parsed
    } catch {
      layout = null
    }
  }

  return NextResponse.json({
    layout,
    floor: {
      id: floor.id,
      name: floor.name,
      number: floor.number,
      ratePerSqm: floor.ratePerSqm,
    },
    spaces: floor.spaces.map((space) => {
      const tenant = space.tenantSpaces[0]?.tenant ?? space.tenant
      return {
        id: space.id,
        number: space.number,
        area: space.area,
        status: space.status,
        kind: space.kind,
        description: space.description,
        photos: parseSpacePhotos(space.photos),
        tenant: tenant
          ? {
              id: tenant.id,
              companyName: tenant.companyName,
              contractEnd: tenant.contractEnd,
              debt: debtByTenant.get(tenant.id) ?? 0,
            }
          : null,
      }
    }),
  })
}
