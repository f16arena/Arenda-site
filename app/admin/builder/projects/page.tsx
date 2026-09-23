export const dynamic = "force-dynamic"

import Link from "next/link"
import { redirect } from "next/navigation"
import { Boxes, Map as MapIcon } from "lucide-react"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { buildingScope } from "@/lib/tenant-scope"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { summarizeLayouts } from "@/lib/indoor-map/layout-source"
import { getLocale, getT } from "@/lib/i18n/server"
import { formatNumberL } from "@/lib/i18n/format"

/**
 * 3D-объекты: здания организации, у каждого одна модель в конструкторе.
 * Никаких «проектов»-снимков — здание одно, модель одна.
 */
export default async function BuilderObjectsPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const locale = await getLocale()
  const { t } = await getT(locale)
  const { orgId } = await requireOrgAccess()

  const accessibleIds = await getAccessibleBuildingIdsForSession(orgId)
  const buildings = await db.building.findMany({
    where: { AND: [buildingScope(orgId), { id: { in: accessibleIds } }] },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      address: true,
      floors: {
        select: {
          kind: true,
          layoutJson: true,
          spaces: { select: { status: true, kind: true, area: true } },
        },
      },
    },
  })

  const objects = buildings.map((building) => {
    const floors = building.floors.filter((floor) => floor.kind !== "TERRITORY")
    const rentable = building.floors.flatMap((floor) => floor.spaces).filter((s) => s.kind !== "COMMON")
    const vacant = rentable.filter((space) => space.status === "VACANT")
    return {
      id: building.id,
      name: building.name,
      address: building.address,
      floors: floors.length,
      spaces: rentable.length,
      vacantArea: vacant.reduce((sum, space) => sum + space.area, 0),
      layouts: summarizeLayouts(floors.map((floor) => floor.layoutJson)),
    }
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400">
          <Boxes className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("adminBuilder.title")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("adminBuilder.subtitle")}
          </p>
        </div>
      </div>

      {objects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {t("adminBuilder.empty")}{" "}
          <Link href="/admin/buildings" className="font-medium text-blue-600 hover:underline">
            {t("adminObjects.buildingForm.addButton")}
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {objects.map((object) => (
            <div
              key={object.id}
              className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{object.name}</h2>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{object.address}</p>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-800/60">
                  <div className="text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">{object.floors}</div>
                  <div className="text-[11px] text-slate-500">{t("adminObjects.spaces.shortFloors")}</div>
                </div>
                <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-800/60">
                  <div className="text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">{object.spaces}</div>
                  <div className="text-[11px] text-slate-500">{t("adminBuilder.statSpaces")}</div>
                </div>
                <div className="rounded-lg bg-slate-50 py-2 dark:bg-slate-800/60">
                  <div className="text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {formatNumberL(locale, object.vacantArea)}
                  </div>
                  <div className="text-[11px] text-slate-500">{t("adminBuilder.statVacantArea")}</div>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                {object.layouts.drawn + object.layouts.schema === 0
                  ? t("adminBuilder.noLayouts")
                  : [
                      object.layouts.drawn > 0 ? t("adminBuilder.layoutsDrawn", { count: object.layouts.drawn }) : null,
                      object.layouts.schema > 0 ? t("adminBuilder.layoutsSchema", { count: object.layouts.schema }) : null,
                      object.layouts.none > 0 ? t("adminBuilder.layoutsNone", { count: object.layouts.none }) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
              </p>

              <div className="mt-auto flex flex-wrap gap-2">
                <Link
                  href={`/admin/builder/${object.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
                >
                  <Boxes className="h-3.5 w-3.5" /> {t("adminBuilder.openBuilder")}
                </Link>
                <Link
                  href={`/admin/buildings/${object.id}/map`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <MapIcon className="h-3.5 w-3.5" /> {t("adminBuilder.floorMap")}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
