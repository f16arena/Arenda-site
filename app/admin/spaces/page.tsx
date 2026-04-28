export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { formatMoney, STATUS_COLORS, STATUS_LABELS } from "@/lib/utils"
import { Building2 } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { AddSpaceDialog, EditSpaceDialog, DeleteSpaceButton } from "./space-actions"

export default async function SpacesPage() {
  const building = await db.building.findFirst({
    where: { isActive: true },
    include: {
      floors: {
        orderBy: { number: "asc" },
        include: {
          spaces: {
            include: { tenant: { select: { id: true, companyName: true } } },
            orderBy: { number: "asc" },
          },
        },
      },
    },
  })

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
        const maxArea = Math.max(...floor.spaces.map((s) => s.area), 1)

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
                  {/* Visual map */}
                  <div className="relative border-2 border-slate-200 rounded-lg p-4 bg-slate-50 min-h-[80px]">
                    <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                      <span className="text-[10px] text-slate-300 uppercase tracking-widest font-semibold bg-slate-50 px-2">Коридор</span>
                      <div className="absolute left-4 right-4 h-px bg-slate-200 -z-10" />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {floor.spaces.map((space) => {
                        const widthPx = Math.max(60, Math.min(160, (space.area / maxArea) * 140 + 60))
                        return (
                          <div
                            key={space.id}
                            className={cn(
                              "relative flex flex-col justify-between rounded border p-2",
                              space.status === "OCCUPIED" ? "border-blue-200 bg-blue-50"
                              : space.status === "VACANT" ? "border-emerald-200 bg-emerald-50"
                              : "border-amber-200 bg-amber-50"
                            )}
                            style={{ width: `${widthPx}px`, minHeight: "72px" }}
                          >
                            <p className="text-xs font-bold text-slate-800">{space.number}</p>
                            <p className="text-[10px] text-slate-500">{space.area} м²</p>
                            {space.tenant && (
                              <p className="text-[10px] text-slate-600 truncate">{space.tenant.companyName}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>

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
