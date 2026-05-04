export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { formatMoney, STATUS_COLORS, STATUS_LABELS } from "@/lib/utils"
import { Building2 } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { AddSpaceDialog, EditSpaceDialog, DeleteSpaceButton } from "./space-actions"
import { WipeAllSpacesButton } from "./wipe-all-button"
import { UnassignFloorButton } from "./unassign-floor-button"
import { hasFeature } from "@/lib/plan-features"
import type { SpaceInfo } from "@/components/floor/floor-view"
import { FloorViewLoader } from "@/components/floor/floor-view-loader"
import { isLayoutV2 } from "@/lib/floor-layout"
import { getCurrentBuildingId } from "@/lib/current-building"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { switchBuilding } from "@/app/actions/buildings"
import { tenantScope } from "@/lib/tenant-scope"
import { measureServerRoute } from "@/lib/server-performance"

export default async function SpacesPage() {
  return measureServerRoute("/admin/spaces", async () => {
  const { orgId } = await requireOrgAccess()
  const buildingId = await getCurrentBuildingId()
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)

  if (!buildingId) {
    if (accessibleBuildingIds.length === 0) {
      return (
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Помещения</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Кабинеты и помещения в зданиях</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/5 p-8 text-center">
            <Building2 className="h-10 w-10 text-amber-500 mx-auto mb-3" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Сначала создайте здание
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 max-w-md mx-auto">
              Помещения существуют внутри зданий. Создайте первое здание (адрес,
              количество этажей, площадь) — потом сможете добавлять помещения.
            </p>
            <Link
              href="/admin/buildings"
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 px-4 py-2 text-sm font-medium text-white"
            >
              <Building2 className="h-4 w-4" />
              К списку зданий →
            </Link>
          </div>
        </div>
      )
    }

    const buildings = await db.building.findMany({
      where: { id: { in: accessibleBuildingIds }, organizationId: orgId, isActive: true },
      orderBy: { createdAt: "asc" },
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
            totalArea: true,
            ratePerSqm: true,
          },
        },
      },
    })
    const floorIds = buildings.flatMap((building) => building.floors.map((floor) => floor.id))
    const spaceStats = floorIds.length > 0
      ? await db.space.groupBy({
          by: ["floorId", "status"],
          where: { floorId: { in: floorIds }, kind: { not: "COMMON" } },
          _count: { _all: true },
          _sum: { area: true },
        }).catch(() => [] as Array<{
          floorId: string
          status: string
          _count: { _all: number }
          _sum: { area: number | null }
        }>)
      : []

    const buildingSummaries = buildings.map((building) => {
      const floorSummaries = building.floors.map((floor) => {
        const stats = spaceStats.filter((item) => item.floorId === floor.id)
        const totalSpaces = stats.reduce((sum, item) => sum + item._count._all, 0)
        const occupied = stats.find((item) => item.status === "OCCUPIED")?._count._all ?? 0
        const vacant = stats.find((item) => item.status === "VACANT")?._count._all ?? 0
        const area = stats.reduce((sum, item) => sum + (item._sum.area ?? 0), 0)

        return {
          id: floor.id,
          name: floor.name,
          ratePerSqm: floor.ratePerSqm,
          totalSpaces,
          occupied,
          vacant,
          area,
        }
      })
      const totalSpaces = floorSummaries.reduce((sum, floor) => sum + floor.totalSpaces, 0)
      const occupied = floorSummaries.reduce((sum, floor) => sum + floor.occupied, 0)
      const vacant = floorSummaries.reduce((sum, floor) => sum + floor.vacant, 0)
      const area = floorSummaries.reduce((sum, floor) => sum + floor.area, 0)

      return {
        id: building.id,
        name: building.name,
        address: building.address,
        floorsCount: floorSummaries.length,
        floorSummaries,
        totalSpaces,
        occupied,
        vacant,
        area,
      }
    })
    const rentableSpacesCount = buildingSummaries.reduce((sum, building) => sum + building.totalSpaces, 0)
    const occupied = buildingSummaries.reduce((sum, building) => sum + building.occupied, 0)
    const vacant = buildingSummaries.reduce((sum, building) => sum + building.vacant, 0)
    const totalArea = buildingSummaries.reduce((sum, building) => sum + building.area, 0)

    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Помещения</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Все доступные здания · {buildings.length} {buildings.length === 1 ? "здание" : "зданий"}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Зданий", value: String(buildings.length), color: "text-slate-900 dark:text-slate-100" },
            { label: "Помещений", value: String(rentableSpacesCount), color: "text-slate-900 dark:text-slate-100" },
            { label: "Занято", value: String(occupied), color: "text-blue-600 dark:text-blue-400" },
            { label: "Свободно", value: String(vacant), color: "text-emerald-600 dark:text-emerald-400" },
          ].map((s) => (
            <div key={s.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Общая арендопригодная площадь</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{totalArea.toFixed(1)} м²</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Для добавления или редактирования помещений выберите конкретное здание в переключателе сверху.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {buildingSummaries.map((building) => (
            <div key={building.id} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{building.name}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{building.address}</p>
                </div>
                <form
                  action={async () => {
                    "use server"
                    await switchBuilding(building.id)
                  }}
                >
                  <button
                    type="submit"
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Открыть
                  </button>
                </form>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{building.floorsCount}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">этажей</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/60">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{building.totalSpaces}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">помещ.</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-2 dark:bg-blue-500/10">
                  <p className="text-sm font-bold text-blue-600 dark:text-blue-400">{building.occupied}</p>
                  <p className="text-[10px] text-blue-700 dark:text-blue-300">занято</p>
                </div>
                <div className="rounded-lg bg-emerald-50 p-2 dark:bg-emerald-500/10">
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{building.vacant}</p>
                  <p className="text-[10px] text-emerald-700 dark:text-emerald-300">своб.</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {building.floorSummaries.slice(0, 6).map((floor) => (
                  <div key={floor.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-xs dark:border-slate-800">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800 dark:text-slate-200">{floor.name}</p>
                      <p className="text-slate-400 dark:text-slate-500">{formatMoney(floor.ratePerSqm)}/м²</p>
                    </div>
                    <div className="text-right text-slate-500 dark:text-slate-400">
                      <p>{floor.totalSpaces} помещ. · {floor.area.toFixed(1)} м²</p>
                      <p>{floor.occupied} занято · {floor.vacant} свободно</p>
                    </div>
                  </div>
                ))}
                {building.floorSummaries.length > 6 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Еще {building.floorSummaries.length - 6} этажей. Выберите здание сверху, чтобы увидеть все помещения.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const building = buildingId ? await db.building.findUnique({
    where: { id: buildingId },
    include: {
      floors: {
        orderBy: { number: "asc" },
        include: {
          fullFloorTenant: {
            select: { id: true, companyName: true, contractEnd: true },
          },
          spaces: {
            include: {
              tenant: {
                select: {
                  id: true,
                  companyName: true,
                  contractEnd: true,
                  customRate: true,
                  fixedMonthlyRent: true,
                  fullFloors: { select: { fixedMonthlyRent: true } },
                  tenantSpaces: {
                    select: {
                      space: {
                        select: {
                          area: true,
                          floor: { select: { ratePerSqm: true } },
                        },
                      },
                    },
                  },
                },
              },
              tenantSpaces: {
                select: {
                  tenant: {
                    select: {
                      id: true,
                      companyName: true,
                      contractEnd: true,
                      customRate: true,
                      fixedMonthlyRent: true,
                      fullFloors: { select: { fixedMonthlyRent: true } },
                      tenantSpaces: {
                        select: {
                          space: {
                            select: {
                              area: true,
                              floor: { select: { ratePerSqm: true } },
                            },
                      },
                    },
                  },
                    },
                  },
                },
              },
            },
            orderBy: { number: "asc" },
          },
        },
      },
    },
  }) : null

  const hasFloorEditor = await hasFeature(orgId, "floorEditor")
  const allSpaces = building?.floors.flatMap((f) => f.spaces) ?? []
  // Считаем заполняемость только по RENTABLE — общие зоны не сдаются.
  const rentableSpaces = allSpaces.filter((s) => s.kind !== "COMMON")
  const total = rentableSpaces.length
  const occupied = rentableSpaces.filter((s) => s.status === "OCCUPIED").length
  const vacant = rentableSpaces.filter((s) => s.status === "VACANT").length
  const rentableArea = rentableSpaces.reduce((s, sp) => s + sp.area, 0)
  const buildingTotalArea = building?.totalArea ?? 0
  const sumFloorArea = (building?.floors ?? []).reduce((s, f) => s + (f.totalArea ?? 0), 0)
  const tenantIds = Array.from(new Set(allSpaces.flatMap((space) => {
    return [
      space.tenant?.id,
      ...space.tenantSpaces.map((item) => item.tenant.id),
    ].filter((value): value is string => Boolean(value))
  })))
  const tenantDebtRows = tenantIds.length > 0
    ? await db.charge.groupBy({
        by: ["tenantId"],
        where: { tenantId: { in: tenantIds }, isPaid: false },
        _sum: { amount: true },
      }).catch(() => [] as Array<{ tenantId: string; _sum: { amount: number | null } }>)
    : []
  const debtByTenant = new Map(tenantDebtRows.map((row) => [row.tenantId, row._sum.amount ?? 0]))

  const floors = building?.floors ?? []
  const floorOptions = floors.map((f) => ({
    id: f.id,
    name: f.name,
    number: f.number,
    totalArea: f.totalArea,
    usedArea: f.spaces.reduce((s, sp) => s + sp.area, 0),
  }))
  const tenantOptionsRaw = building
    ? await db.tenant.findMany({
        where: {
          AND: [
            tenantScope(orgId),
            { fullFloors: { none: {} } },
            {
              OR: [
                { spaceId: null },
                { space: { floor: { buildingId: building.id } } },
              ],
            },
            {
              tenantSpaces: {
                none: { space: { floor: { buildingId: { not: building.id } } } },
              },
            },
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
          },
        },
      })
    : []
  const assignableTenants = tenantOptionsRaw.flatMap((tenant) => {
    const buildingIds = new Set<string>()
    const placements = new Set<string>()

    if (tenant.space?.floor.buildingId) {
      buildingIds.add(tenant.space.floor.buildingId)
      if (tenant.space.floor.buildingId === building?.id) placements.add(`Каб. ${tenant.space.number}`)
    }
    for (const item of tenant.tenantSpaces) {
      buildingIds.add(item.space.floor.buildingId)
      if (item.space.floor.buildingId === building?.id) placements.add(`Каб. ${item.space.number}`)
    }

    const assignedToOtherBuilding = buildingIds.size > 0 && !!building && !buildingIds.has(building.id)
    if (assignedToOtherBuilding) return []

    return [{
      id: tenant.id,
      companyName: tenant.companyName,
      placement: placements.size > 0 ? Array.from(placements).join(", ") : null,
    }]
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Помещения</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">{building?.name} · {building?.address}</p>
        </div>
        <div className="flex items-center gap-2">
          {building && allSpaces.length > 0 && (
            <WipeAllSpacesButton
              buildingId={building.id}
              buildingName={building.name}
              spacesCount={allSpaces.length}
            />
          )}
          <AddSpaceDialog floors={floorOptions} />
        </div>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Всего помещений", value: String(total), color: "text-slate-900 dark:text-slate-100" },
          { label: "Занято", value: String(occupied), color: "text-blue-600 dark:text-blue-400" },
          { label: "Свободно", value: String(vacant), color: "text-emerald-600 dark:text-emerald-400" },
          { label: "Заполняемость", value: `${total ? Math.round((occupied / total) * 100) : 0}%`, color: "text-slate-900 dark:text-slate-100" },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Area hierarchy: Σ Space.area ≤ Σ Floor.totalArea ≤ Building.totalArea */}
      {(() => {
        // На сервере вычисляем флаги для более чистого JSX
        const hasFloorAreas = sumFloorArea > 0
        const hasBuildingArea = buildingTotalArea > 0
        const overFloors = hasFloorAreas && rentableArea > sumFloorArea + 0.05
        const overBuilding = hasBuildingArea && sumFloorArea > buildingTotalArea + 0.05
        const utilizationVsFloors = hasFloorAreas ? (rentableArea / sumFloorArea) * 100 : 0
        const coverageVsBuilding = hasBuildingArea ? (sumFloorArea / buildingTotalArea) * 100 : 0
        return (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Площади</h3>
              <span className={`text-xs font-medium ${overFloors || overBuilding ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {overFloors || overBuilding ? "⚠ Расхождения" : "✓ Согласовано"}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Арендопригодная */}
              <div className="rounded-lg border border-emerald-100 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/5 p-3">
                <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">Арендопригодная</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-1">{rentableArea.toFixed(1)} м²</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Σ помещений (Space.area)</p>
              </div>

              {/* Σ этажей */}
              <div className={`rounded-lg border p-3 ${overFloors ? "border-red-200 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/5" : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"}`}>
                <p className={`text-xs font-medium ${overFloors ? "text-red-700 dark:text-red-300" : "text-slate-600 dark:text-slate-400"}`}>Σ площадь этажей</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-1">
                  {hasFloorAreas ? `${sumFloorArea.toFixed(1)} м²` : "— не задана"}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {hasFloorAreas
                    ? `Загруженность: ${utilizationVsFloors.toFixed(0)}%`
                    : "Заполните Floor.totalArea на каждом этаже"}
                </p>
              </div>

              {/* Здание */}
              <div className={`rounded-lg border p-3 ${overBuilding ? "border-red-200 dark:border-red-500/30 bg-red-50/50 dark:bg-red-500/5" : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"}`}>
                <p className={`text-xs font-medium ${overBuilding ? "text-red-700 dark:text-red-300" : "text-slate-600 dark:text-slate-400"}`}>Площадь здания</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums mt-1">
                  {hasBuildingArea ? `${buildingTotalArea} м²` : "— не задана"}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {hasBuildingArea
                    ? `Этажи покрывают ${coverageVsBuilding.toFixed(0)}%`
                    : "Заполните в карточке здания"}
                </p>
              </div>
            </div>

            {/* Stacked progress bar */}
            {hasBuildingArea && (
              <div className="mt-4">
                <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                  {/* арендопригодная */}
                  <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (rentableArea / buildingTotalArea) * 100)}%` }} />
                  {/* остальные этажи (общие зоны/стены) */}
                  {sumFloorArea > rentableArea && (
                    <div className="h-full bg-slate-400" style={{ width: `${Math.min(100, ((sumFloorArea - rentableArea) / buildingTotalArea) * 100)}%` }} />
                  )}
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                  <span>0</span>
                  <span>{buildingTotalArea} м² (здание)</span>
                </div>
              </div>
            )}

            {/* Validation messages */}
            {(overFloors || overBuilding) && (
              <div className="mt-3 space-y-1">
                {overFloors && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    ⚠ Сумма помещений ({rentableArea.toFixed(1)} м²) больше суммы площадей этажей ({sumFloorArea.toFixed(1)} м²).
                    Откройте этаж и увеличьте «Общую площадь этажа» или уменьшите площадь конкретных помещений.
                  </p>
                )}
                {overBuilding && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    ⚠ Сумма этажей ({sumFloorArea.toFixed(1)} м²) больше площади здания ({buildingTotalArea} м²).
                    Исправьте «Общую площадь здания» в карточке здания.
                  </p>
                )}
              </div>
            )}
            {!overFloors && !overBuilding && (!hasFloorAreas || !hasBuildingArea) && (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                💡 Заполните общие площади всех этажей и здания, чтобы система могла защищать вас от ввода помещений сверх лимита.
              </p>
            )}
          </div>
        )
      })()}

      {/* Floors */}
      {floors.map((floor) => {
        const floorOccupied = floor.spaces.filter((s) => s.status === "OCCUPIED").length
        const floorArea = floor.spaces.reduce((s, sp) => s + sp.area, 0)

        // Парсим план этажа
        let layout = null
        if (floor.layoutJson) {
          try {
            const parsed = JSON.parse(floor.layoutJson)
            if (isLayoutV2(parsed)) layout = parsed
          } catch {}
        }

        // Готовим данные о помещениях для FloorView
        const spaceInfos: SpaceInfo[] = floor.spaces.map((s) => {
          const tenant = s.tenantSpaces[0]?.tenant ?? s.tenant
          return {
            id: s.id,
            number: s.number,
            area: s.area,
            status: s.status,
            description: s.description,
            tenant: tenant ? {
              id: tenant.id,
              companyName: tenant.companyName,
              contractEnd: tenant.contractEnd,
              debt: debtByTenant.get(tenant.id) ?? 0,
            } : null,
          }
        })

        const fullFloorTenant = floor.fullFloorTenant
        return (
          <div key={floor.id} id={`floor-${floor.id}`} className={cn(
            "scroll-mt-20",
            "bg-white dark:bg-slate-900 rounded-xl border overflow-hidden",
            fullFloorTenant
              ? "border-violet-300 dark:border-violet-500/40"
              : "border-slate-200 dark:border-slate-800",
          )}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{floor.name}</h2>
                <span className="text-xs text-slate-400 dark:text-slate-500">Ставка: {formatMoney(floor.ratePerSqm)}/м²</span>
                {floor.totalArea && <span className="text-xs text-slate-400 dark:text-slate-500">· {floor.totalArea} м²</span>}
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                <span><span className="font-medium text-blue-600 dark:text-blue-400">{floorOccupied}</span> / {floor.spaces.length} занято</span>
                <span>{floorArea} м²</span>
                <Link
                  href={`/admin/floors/${floor.id}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  title="Настройки этажа"
                >
                  Настройки этажа →
                </Link>
              </div>
            </div>
            {fullFloorTenant && (
              <div className="px-5 py-3 bg-violet-50 dark:bg-violet-500/5 border-b border-violet-100 dark:border-violet-500/20 flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 text-xs font-bold">⚿</span>
                <div className="flex-1 text-xs">
                  <p className="font-medium text-violet-900 dark:text-violet-200">
                    Этаж сдан целиком: <Link href={`/admin/tenants/${fullFloorTenant.id}`} className="underline hover:no-underline">{fullFloorTenant.companyName}</Link>
                    {fullFloorTenant.contractEnd && (
                      <span className="ml-2 text-violet-600 dark:text-violet-400">
                        (договор до {new Date(fullFloorTenant.contractEnd).toLocaleDateString("ru-RU")})
                      </span>
                    )}
                  </p>
                  <p className="text-violet-700 dark:text-violet-400 mt-0.5">
                    Помещения этажа недоступны для индивидуальной сдачи.
                  </p>
                </div>
                <UnassignFloorButton
                  floorId={floor.id}
                  floorName={floor.name}
                  tenantName={fullFloorTenant.companyName}
                />
              </div>
            )}

            <div className="p-5">
              {floor.spaces.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">Нет помещений на этом этаже</p>
              ) : (
                <div className="space-y-3">
                  {/* Visual map — показываем только если фича включена и план задан */}
                  {hasFloorEditor && layout && (
                    <FloorViewLoader layout={layout} spaces={spaceInfos} />
                  )}
                  {hasFloorEditor && !layout && (
                    <div className="relative border-2 border-dashed border-purple-200 dark:border-purple-500/30 rounded-lg p-4 bg-purple-50/30 dark:bg-purple-500/5 text-center">
                      <div className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 text-[9px] font-bold uppercase tracking-wider mb-1">
                        BETA
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Визуализация помещения не настроена</p>
                      <Link
                        href={`/admin/floors/${floor.id}/visualization`}
                        className="inline-flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400 hover:underline"
                      >
                        Загрузить PDF плана →
                      </Link>
                    </div>
                  )}

                  {/* Table */}
                  <table className="w-full text-xs border border-slate-100 dark:border-slate-800 rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                        <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Кабинет</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Площадь</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Аренда/мес</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Арендатор</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Статус</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Описание</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {floor.spaces.map((space) => {
                        const tenant = space.tenantSpaces[0]?.tenant ?? space.tenant
                        const displayTenant = tenant ?? fullFloorTenant
                        const occupancyTenant = tenant
                          ? { id: tenant.id, companyName: tenant.companyName }
                          : fullFloorTenant
                            ? { id: fullFloorTenant.id, companyName: `${fullFloorTenant.companyName} (этаж целиком)` }
                            : null
                        const rentAmount = tenant
                          ? calculateTenantMonthlyRent({
                              customRate: tenant.customRate,
                              fixedMonthlyRent: tenant.fixedMonthlyRent,
                              fullFloors: tenant.fullFloors,
                              tenantSpaces: tenant.tenantSpaces,
                              space: { area: space.area, floor: { ratePerSqm: floor.ratePerSqm } },
                            })
                          : space.area * floor.ratePerSqm

                        return (
                          <tr key={space.id} className="border-b border-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50">
                            <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">Каб. {space.number}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400 dark:text-slate-500">{space.area} м²</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400 dark:text-slate-500">
                              {tenant ? formatMoney(rentAmount) : `≈ ${formatMoney(rentAmount)}`}
                            </td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400 dark:text-slate-500">
                              {displayTenant ? (
                                <Link href={`/admin/tenants/${displayTenant.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                                  {displayTenant.companyName}{!tenant && fullFloorTenant ? " · этаж целиком" : ""}
                                </Link>
                              ) : <span className="text-slate-400 dark:text-slate-500">—</span>}
                            </td>
                            <td className="px-3 py-2">
                              <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", STATUS_COLORS[space.status])}>
                                {STATUS_LABELS[space.status] ?? space.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-400 dark:text-slate-500">{space.description ?? "—"}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <EditSpaceDialog
                                  space={{
                                    id: space.id,
                                    number: space.number,
                                    area: space.area,
                                    status: space.status,
                                    description: space.description,
                                    tenant: occupancyTenant,
                                  }}
                                  floors={floorOptions}
                                  tenants={assignableTenants}
                                />
                                <DeleteSpaceButton spaceId={space.id} hasTenant={!!displayTenant} />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
  })
}
