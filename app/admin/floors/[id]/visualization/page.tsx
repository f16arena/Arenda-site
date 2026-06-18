import { db } from "@/lib/db"
import { auth } from "@/auth"
import { notFound, redirect } from "next/navigation"
import { FloorEditorLoader } from "../floor-editor-loader"
import { Sparkles } from "lucide-react"
import Link from "next/link"
import { isLayoutV2, type FloorLayoutV2 } from "@/lib/floor-layout"
import { requireOrgAccess } from "@/lib/org"
import { assertFloorInOrg } from "@/lib/scope-guards"
import { hasFeature } from "@/lib/plan-features"
import { getF16TemplateByFloorNumber } from "@/lib/f16-templates"

export default async function FloorVisualizationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()

  const { id } = await params

  // Гейт: визуализация помещения — BETA-фича на топ-тарифах
  const hasFloorEditor = await hasFeature(orgId, "floorEditor")
  if (!hasFloorEditor) {
    return (
      <div className="space-y-4">
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-500/5 dark:to-indigo-500/5 border border-purple-200 dark:border-purple-500/30 rounded-xl p-8 text-center max-w-2xl mx-auto mt-12">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-purple-600 mb-4">
            <Sparkles className="h-7 w-7 text-white" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-bold uppercase tracking-wider mb-3">
            BETA
          </div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
            Визуализация помещения
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
            Загрузите PDF плана этажа, и AI автоматически распознает помещения, площади и высоту потолков.
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            Затем — интерактивный редактор, привязка к Space-записям, и 3D-вид (скоро).
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-500 mb-4">
            Доступно только на тарифе «Бизнес» и выше.
          </p>
          <Link
            href="/admin/subscription"
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 text-sm font-medium"
          >
            Перейти к тарифам →
          </Link>
        </div>
      </div>
    )
  }

  try {
    await assertFloorInOrg(id, orgId)
  } catch {
    notFound()
  }

  const floor = await db.floor.findUnique({
    where: { id },
    include: {
      spaces: { orderBy: { number: "asc" }, select: { id: true, number: true, status: true, area: true } },
    },
  })

  if (!floor) notFound()

  let initialLayout: FloorLayoutV2 | null = null
  if (floor.layoutJson) {
    try {
      const parsed = JSON.parse(floor.layoutJson)
      if (isLayoutV2(parsed)) initialLayout = parsed
    } catch {}
  }
  const f16Template = getF16TemplateByFloorNumber(floor.number)

  // Для территории — опорный контур здания: максимальные габариты обычных этажей.
  let buildingFootprint: { width: number; depth: number; name: string } | null = null
  if (floor.kind === "TERRITORY") {
    const building = await db.building.findUnique({
      where: { id: floor.buildingId },
      select: {
        name: true,
        floors: {
          where: { kind: { notIn: ["TERRITORY", "ROOF"] } },
          select: { layoutJson: true },
        },
      },
    })
    let w = 0
    let d = 0
    for (const f of building?.floors ?? []) {
      if (!f.layoutJson) continue
      try {
        const parsed = JSON.parse(f.layoutJson)
        if (isLayoutV2(parsed)) {
          w = Math.max(w, parsed.width)
          d = Math.max(d, parsed.height)
        }
      } catch {}
    }
    buildingFootprint = { width: w > 0 ? w : 30, depth: d > 0 ? d : 20, name: building?.name ?? "Здание" }
  }

  return (
    <div className="space-y-4">
      <FloorEditorLoader
        floorId={floor.id}
        floorName={floor.name}
        floorNumber={floor.number}
        floorKind={floor.kind}
        buildingFootprint={buildingFootprint}
        f16Template={f16Template}
        initialLayout={initialLayout}
        initialTotalArea={floor.totalArea ?? null}
        spaces={floor.spaces}
      />
    </div>
  )
}
