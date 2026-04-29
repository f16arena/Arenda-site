export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { formatMoney, STATUS_COLORS, STATUS_LABELS } from "@/lib/utils"
import { Building2 } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { AddSpaceDialog, EditSpaceDialog, DeleteSpaceButton } from "./space-actions"
import { FloorView, type SpaceInfo } from "@/components/floor/floor-view"
import { isLayoutV2 } from "@/lib/floor-layout"
import { getCurrentBuildingId } from "@/lib/current-building"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"

export default async function SpacesPage() {
  const { orgId } = await requireOrgAccess()
  const buildingId = await getCurrentBuildingId()
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)
  const building = buildingId ? await db.building.findUnique({
    where: { id: buildingId },
    include: {
      floors: {
        orderBy: { number: "asc" },
        include: {
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

  const allSpaces = building?.floors.flatMap((f) => f.spaces) ?? []
  const total = allSpaces.length
  const occupied = allSpaces.filter((s) => s.status === "OCCUPIED").length
  const vacant = allSpaces.filter((s) => s.status === "VACANT").length
  const totalArea = allSpaces.reduce((s, sp) => s + sp.area, 0)

  const floors = building?.floors ?? []
  const floorOptions = floors.map((f) => ({ id: f.id, name: f.name, number: f.number }))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Помещения</h1>
          <p className="text-sm text-slate-500 mt-0.5">{building?.name} · {building?.address}</p>
        </div>
        <AddSpaceDialog floors={floorOptions} />
      </div>

      {/* Summary */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: "Всего", value: String(total), color: "text-slate-900" },
          { label: "Занято", value: String(occupied), color: "text-blue-600" },
          { label: "Свободно", value: String(vacant), color: "text-emerald-600" },
          { label: "Заполняемость", value: `${total ? Math.round((occupied / total) * 100) : 0}%`, color: "text-slate-900" },
          { label: "Общая площадь", value: `${totalArea} м²`, color: "text-slate-900" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

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

        return (
          <div key={floor.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-900">{floor.name}</h2>
                <span className="text-xs text-slate-400">Ставка: {formatMoney(floor.ratePerSqm)}/м²</span>
                {floor.totalArea && <span className="text-xs text-slate-400">· {floor.totalArea} м²</span>}
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span><span className="font-medium text-blue-600">{floorOccupied}</span> / {floor.spaces.length} занято</span>
                <span>{floorArea} м²</span>
                <Link href={`/admin/floors/${floor.id}`} className="text-blue-600 hover:text-blue-800 font-medium">
                  Редактировать план →
                </Link>
              </div>
            </div>

            <div className="p-5">
              {floor.spaces.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Нет помещений на этом этаже</p>
              ) : (
                <div className="space-y-3">
                  {/* Visual map — SVG план если задан, иначе fallback */}
                  {layout ? (
                    <FloorView layout={layout} spaces={spaceInfos} floorId={floor.id} />
                  ) : (
                    <div className="relative border-2 border-dashed border-slate-200 rounded-lg p-6 bg-slate-50 text-center">
                      <p className="text-sm text-slate-500 mb-2">План этажа не нарисован</p>
                      <Link
                        href={`/admin/floors/${floor.id}`}
                        className="inline-flex items-center gap-2 text-xs text-blue-600 hover:underline"
                      >
                        Открыть редактор плана →
                      </Link>
                    </div>
                  )}

                  {/* Table */}
                  <table className="w-full text-xs border border-slate-100 rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-3 py-2 text-left font-medium text-slate-500">Кабинет</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">Площадь</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">Аренда/мес</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">Арендатор</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">Статус</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">Описание</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {floor.spaces.map((space) => (
                        <tr key={space.id} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-800">Каб. {space.number}</td>
                          <td className="px-3 py-2 text-slate-600">{space.area} м²</td>
                          <td className="px-3 py-2 text-slate-600">{formatMoney(space.area * floor.ratePerSqm)}</td>
                          <td className="px-3 py-2 text-slate-600">
                            {space.tenant ? (
                              <Link href={`/admin/tenants/${space.tenant.id}`} className="text-blue-600 hover:underline">
                                {space.tenant.companyName}
                              </Link>
                            ) : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-3 py-2">
                            <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", STATUS_COLORS[space.status])}>
                              {STATUS_LABELS[space.status] ?? space.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-400">{space.description ?? "—"}</td>
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
