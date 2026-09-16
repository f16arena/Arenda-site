export const dynamic = "force-dynamic"

import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, Map as MapIcon } from "lucide-react"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import { buildingScope } from "@/lib/tenant-scope"
import { classifyCategory } from "@/lib/indoor-map/category"
import type { SpaceLite } from "@/lib/indoor-map/model"
import { IndoorMapApp, type FloorData } from "@/components/indoor-map/indoor-map-app"

/**
 * Indoor-карта здания: план этажа с арендаторами и статусами, лента этажей.
 * Источник правды по модулю — docs/indoor-map/SPEC.md.
 */
export default async function BuildingMapPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ mode?: string }>
}) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()
  const { id } = await params
  const { mode } = await searchParams

  const caps = await getAllowedCapabilityKeysForUser({
    userId: session.user.id,
    role: session.user.role,
    isPlatformOwner: !!session.user.isPlatformOwner,
    orgId,
  })
  const canEdit = caps.includes("floors.edit")

  const building = await db.building.findFirst({
    where: { AND: [buildingScope(orgId), { id }] },
    select: { id: true, name: true, address: true },
  })
  if (!building) notFound()

  const floors = await db.floor.findMany({
    where: { buildingId: building.id },
    orderBy: { number: "asc" },
    select: {
      id: true,
      number: true,
      name: true,
      kind: true,
      layoutJson: true,
      spaces: {
        select: {
          id: true,
          number: true,
          area: true,
          status: true,
          kind: true,
          tenant: {
            select: { id: true, companyName: true, contractEnd: true, category: true, usePurpose: true },
          },
          tenantSpaces: {
            select: {
              tenant: {
                select: { id: true, companyName: true, contractEnd: true, category: true, usePurpose: true },
              },
            },
          },
        },
      },
    },
  })

  // Долг — сумма неоплаченных начислений арендатора. Считаем одним запросом
  // на всё здание, чтобы не ходить в базу за каждым помещением.
  const tenantIds = Array.from(
    new Set(
      floors.flatMap((floor) =>
        floor.spaces.flatMap((space) => {
          const tenant = space.tenant ?? space.tenantSpaces[0]?.tenant ?? null
          return tenant ? [tenant.id] : []
        }),
      ),
    ),
  )
  const debtRows =
    tenantIds.length > 0
      ? await db.charge.groupBy({
          by: ["tenantId"],
          where: { tenantId: { in: tenantIds }, isPaid: false, deletedAt: null },
          _sum: { amount: true },
        })
      : []
  const debtByTenant = new Map(debtRows.map((row) => [row.tenantId, row._sum.amount ?? 0]))

  const data: FloorData[] = floors.map((floor) => ({
    id: floor.id,
    number: floor.number,
    name: floor.name,
    kind: floor.kind,
    layoutJson: floor.layoutJson,
    spaces: floor.spaces.map((space): SpaceLite => {
      // Помещение может быть привязано как напрямую (Tenant.spaceId), так и
      // через TenantSpace, когда арендатор занимает несколько помещений.
      const tenant = space.tenant ?? space.tenantSpaces[0]?.tenant ?? null
      return {
        id: space.id,
        number: space.number,
        area: space.area,
        status: space.status,
        kind: space.kind,
        tenantId: tenant?.id ?? null,
        tenantName: tenant?.companyName ?? null,
        contractEnd: tenant?.contractEnd ? tenant.contractEnd.toISOString() : null,
        category: classifyCategory(tenant?.category, tenant?.usePurpose),
        debt: tenant ? (debtByTenant.get(tenant.id) ?? 0) : 0,
      }
    }),
  }))

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/buildings"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Здания
        </Link>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10">
            <MapIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {building.name} — карта
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">{building.address}</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <IndoorMapApp
          buildingId={building.id}
          floors={data}
          initialMode={mode === "volume" ? "volume" : "plan"}
          canEdit={canEdit}
        />
      </div>
    </div>
  )
}
