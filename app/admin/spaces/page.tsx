export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { formatMoney, STATUS_COLORS, STATUS_LABELS } from "@/lib/utils"
import { Building2 } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { AddSpaceDialog, EditSpaceDialog, DeleteSpaceButton } from "./space-actions"
import { WipeAllSpacesButton } from "./wipe-all-button"
import { hasFeature } from "@/lib/plan-features"
import { FloorView, type SpaceInfo } from "@/components/floor/floor-view"
import { isLayoutV2 } from "@/lib/floor-layout"
import { getCurrentBuildingId } from "@/lib/current-building"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"

export default async function SpacesPage() {
  const { orgId } = await requireOrgAccess()
  const buildingId = await getCurrentBuildingId()
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)

  // Гейт: если в организации нет ни одного здания — блокируем создание помещений.
  // Помещение не существует без здания.
  if (!buildingId) {
    const orgBuildingsCount = await db.building.count({
      where: { organizationId: orgId },
    }).catch(() => 0)

    if (orgBuildingsCount === 0) {
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

    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Помещения</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Выберите здание сверху чтобы видеть его помещения</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-8 text-center">
          <Building2 className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Здание не выбрано. Используйте переключатель здания в шапке.
          </p>
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
                  charges: { where: { isPaid: false }, select: { amount: true } },
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
  const commonSpaces = allSpaces.filter((s) => s.kind === "COMMON")
  const total = rentableSpaces.length
  const occupied = rentableSpaces.filter((s) => s.status === "OCCUPIED").length
  const vacant = rentableSpaces.filter((s) => s.status === "VACANT").length
  const rentableArea = rentableSpaces.reduce((s, sp) => s + sp.area, 0)
  const commonArea = commonSpaces.reduce((s, sp) => s + sp.area, 0)
  const buildingTotalArea = building?.totalArea ?? 0
  const sumFloorArea = (building?.floors ?? []).reduce((s, f) => s + (f.totalArea ?? 0), 0)

  const floors = building?.floors ?? []
  const floorOptions = floors.map((f) => ({ id: f.id, name: f.name, number: f.number }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Помещения</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">{building?.name} · {building?.address}</p>
        </div>
        <div className="flex items-center gap-2">
          {building && total > 0 && (
            <WipeAllSpacesButton
              buildingId={building.id}
              buildingName={building.name}
              spacesCount={total}
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
        const spaceInfos: SpaceInfo[] = floor.spaces.map((s) => ({
          id: s.id,
          number: s.number,
          area: s.area,
          status: s.status,
          description: s.description,
          tenant: s.tenant ? {
            id: s.tenant.id,
            companyName: s.tenant.companyName,
            contractEnd: s.tenant.contractEnd,
            debt: s.tenant.charges.reduce((sum, c) => sum + c.amount, 0),
          } : null,
        }))

        const fullFloorTenant = floor.fullFloorTenant
        return (
          <div key={floor.id} className={cn(
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
                {hasFloorEditor && (
                  <Link
                    href={`/admin/floors/${floor.id}`}
                    className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 hover:text-purple-800 font-medium"
                    title="Визуализация помещения — BETA"
                  >
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300">BETA</span>
                    Визуализация →
                  </Link>
                )}
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
                    Помещения этажа недоступны для индивидуальной сдачи. Чтобы освободить — снимите арендатора с этажа в его карточке.
                  </p>
                </div>
              </div>
            )}

            <div className="p-5">
              {floor.spaces.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">Нет помещений на этом этаже</p>
              ) : (
                <div className="space-y-3">
                  {/* Visual map — показываем только если фича включена и план задан */}
                  {hasFloorEditor && layout && (
                    <FloorView layout={layout} spaces={spaceInfos} floorId={floor.id} />
                  )}
                  {hasFloorEditor && !layout && (
                    <div className="relative border-2 border-dashed border-purple-200 dark:border-purple-500/30 rounded-lg p-4 bg-purple-50/30 dark:bg-purple-500/5 text-center">
                      <div className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 text-[9px] font-bold uppercase tracking-wider mb-1">
                        BETA
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Визуализация помещения не настроена</p>
                      <Link
                        href={`/admin/floors/${floor.id}`}
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
                      {floor.spaces.map((space) => (
                        <tr key={space.id} className="border-b border-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50">
                          <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">Каб. {space.number}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400 dark:text-slate-500">{space.area} м²</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400 dark:text-slate-500">{formatMoney(space.area * floor.ratePerSqm)}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400 dark:text-slate-500">
                            {space.tenant ? (
                              <Link href={`/admin/tenants/${space.tenant.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                                {space.tenant.companyName}
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
                                space={{ id: space.id, number: space.number, area: space.area, status: space.status, description: space.description }}
                                floors={floorOptions}
                              />
                              <DeleteSpaceButton spaceId={space.id} hasТenant={!!space.tenant} />
                            </div>
                          </td>
                        </tr>
                      ))}
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
}
