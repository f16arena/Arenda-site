export const dynamic = "force-dynamic"

import Link from "next/link"
import { redirect } from "next/navigation"
import { Boxes, LayoutGrid, Map as MapIcon, PencilRuler } from "lucide-react"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { buildingScope } from "@/lib/tenant-scope"
import { summarizeLayouts } from "@/lib/indoor-map/layout-source"
import { listBuilderProjects } from "@/app/actions/builder"
import { listBuildableBuildings } from "@/app/actions/builder-from-building"
import { ProjectsList } from "./projects-client"
import { BuildFromBuilding } from "./build-from-building"

/**
 * 3D-объекты.
 *
 * Раньше здесь жили «проекты»: каждая сборка здания создавала новый снимок,
 * и у одного БЦ накапливалось семь одинаковых записей с разным временем.
 * Но здание — не документ: оно одно, и его модель должна быть выведена из
 * этажей, помещений и планов, то есть всегда актуальной. Поэтому страница
 * показывает объекты, а не сохранённые копии. Старый конструктор Building
 * Studio остался в архиве внизу.
 */
export default async function BuilderProjectsPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()

  const buildings = await db.building.findMany({
    where: buildingScope(orgId),
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      address: true,
      floors: {
        select: {
          id: true,
          kind: true,
          layoutJson: true,
          spaces: { select: { status: true, kind: true, area: true } },
        },
      },
    },
  })

  const objects = buildings.map((building) => {
    const floors = building.floors.filter((floor) => floor.kind !== "TERRITORY")
    const spaces = building.floors.flatMap((floor) => floor.spaces)
    const rentable = spaces.filter((space) => space.kind !== "COMMON")
    const vacant = rentable.filter((space) => space.status === "VACANT")
    return {
      id: building.id,
      name: building.name,
      address: building.address,
      floors: floors.length,
      spaces: rentable.length,
      occupied: rentable.length - vacant.length,
      vacantArea: vacant.reduce((sum, space) => sum + space.area, 0),
      layouts: summarizeLayouts(floors.map((floor) => floor.layoutJson)),
    }
  })

  const [projects, buildable] = await Promise.all([listBuilderProjects(), listBuildableBuildings()])

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400">
          <Boxes className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">3D-объекты</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Модель собирается из ваших этажей, помещений и планов — и всегда актуальна.
            Сохранять и пересобирать копии не нужно.
          </p>
        </div>
      </div>

      {objects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Ещё нет ни одного здания.{" "}
          <Link href="/admin/buildings" className="font-medium text-blue-600 hover:underline">
            Добавить здание
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {objects.map((object) => {
            const ready = object.layouts.drawn + object.layouts.schema
            return (
              <div
                key={object.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {object.name}
                  </h2>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {object.address}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-800/60">
                    <div className="text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {object.floors}
                    </div>
                    <div className="text-[11px] text-slate-500">этажей</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-800/60">
                    <div className="text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {object.spaces}
                    </div>
                    <div className="text-[11px] text-slate-500">помещений</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-800/60">
                    <div className="text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {object.vacantArea > 0 ? `${object.vacantArea.toFixed(0)}` : "0"}
                    </div>
                    <div className="text-[11px] text-slate-500">свободно, м²</div>
                  </div>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {ready === 0
                    ? "Планов этажей пока нет — соберём схему по площадям за один клик"
                    : [
                        object.layouts.drawn > 0 ? `${object.layouts.drawn} с планом` : null,
                        object.layouts.schema > 0 ? `${object.layouts.schema} со схемой` : null,
                        object.layouts.none > 0 ? `${object.layouts.none} без плана` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                </p>

                <div className="mt-auto flex flex-wrap gap-2">
                  <Link
                    href={`/admin/buildings/${object.id}/map?mode=volume`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
                  >
                    <Boxes className="h-3.5 w-3.5" /> Открыть 3D
                  </Link>
                  <Link
                    href={`/admin/buildings/${object.id}/map`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <MapIcon className="h-3.5 w-3.5" /> План этажа
                  </Link>
                  {ready === 0 ? (
                    <Link
                      href={`/admin/buildings/${object.id}/map`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <LayoutGrid className="h-3.5 w-3.5" /> Собрать схемы
                    </Link>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Старый конструктор — не выбрасываем, но и не показываем как главное */}
      <details className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200">
          <span className="inline-flex items-center gap-2">
            <PencilRuler className="h-4 w-4" />
            Архив: конструктор Building Studio ({projects.length})
          </span>
        </summary>
        <div className="space-y-4 border-t border-slate-200 p-4 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ручная сборка модели отдельным проектом. Каждая сборка создаёт новый снимок и не
            обновляется вслед за данными, поэтому основным способом больше не является.
          </p>
          <BuildFromBuilding buildings={buildable} />
          <ProjectsList projects={projects} />
        </div>
      </details>
    </div>
  )
}
