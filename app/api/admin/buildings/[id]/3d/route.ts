import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { isLayoutV2 } from "@/lib/floor-layout"
import { requireOrgAccess } from "@/lib/org"
import { buildingScope } from "@/lib/tenant-scope"

export const dynamic = "force-dynamic"

/**
 * Данные для 3D-вида здания целиком: все этажи с планами (FloorLayoutV2)
 * и помещениями (арендатор + долг). Этажи без плана возвращаются с layout: null —
 * фронт показывает их как «пустые» уровни.
 */
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

  const building = await db.building.findFirst({
    where: { AND: [buildingScope(orgId), { id }] },
    select: {
      id: true,
      name: true,
      address: true,
      floors: {
        orderBy: { number: "asc" },
        select: {
          id: true,
          name: true,
          number: true,
          kind: true,
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
              posX: true,
              posZ: true,
              tenant: {
                select: { id: true, companyName: true, contractEnd: true },
              },
              tenantSpaces: {
                select: {
                  tenant: { select: { id: true, companyName: true, contractEnd: true } },
                },
                take: 1,
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      },
    },
  })

  if (!building) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }

  const tenantIds = Array.from(new Set(building.floors.flatMap((floor) =>
    floor.spaces.flatMap((space) => {
      const tenant = space.tenantSpaces[0]?.tenant ?? space.tenant
      return tenant ? [tenant.id] : []
    }),
  )))
  const debtRows = tenantIds.length > 0
    ? await db.charge.groupBy({
        by: ["tenantId"],
        where: { tenantId: { in: tenantIds }, isPaid: false, deletedAt: null },
        _sum: { amount: true },
      })
    : []
  const debtByTenant = new Map(debtRows.map((row) => [row.tenantId, row._sum.amount ?? 0]))

  return NextResponse.json({
    building: { id: building.id, name: building.name, address: building.address },
    floors: building.floors.map((floor) => {
      let layout = null
      if (floor.layoutJson) {
        try {
          const parsed = JSON.parse(floor.layoutJson)
          if (isLayoutV2(parsed)) layout = parsed
        } catch {
          layout = null
        }
      }
      return {
        id: floor.id,
        name: floor.name,
        number: floor.number,
        kind: floor.kind,
        ratePerSqm: floor.ratePerSqm,
        layout,
        spaces: floor.spaces.map((space) => {
          const tenant = space.tenantSpaces[0]?.tenant ?? space.tenant
          return {
            id: space.id,
            number: space.number,
            area: space.area,
            status: space.status,
            kind: space.kind,
            description: space.description,
            posX: space.posX,
            posZ: space.posZ,
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
      }
    }),
  })
}
