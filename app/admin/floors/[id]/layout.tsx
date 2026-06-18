import { db } from "@/lib/db"
import { auth } from "@/auth"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { requireOrgAccess } from "@/lib/org"
import { assertFloorInOrg } from "@/lib/scope-guards"
import { cn } from "@/lib/utils"
import { isZoneFloor, FLOOR_KIND_LABEL, type FloorKind } from "@/lib/zone-kinds"
import { FloorTabs } from "./floor-tabs"

/**
 * Общий каркас карточки этажа: хлебные крошки + вкладки «Данные / План».
 * Layout сохраняется между вкладками, поэтому переключение мгновенное,
 * а каждая вкладка (page.tsx / visualization/page.tsx) рендерится отдельно.
 */
export default async function FloorLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()

  const { id } = await params
  try {
    await assertFloorInOrg(id, orgId)
  } catch {
    notFound()
  }

  const floor = await db.floor.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      kind: true,
      building: { select: { name: true } },
    },
  })
  if (!floor) notFound()

  const isZone = isZoneFloor(floor.kind)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/buildings" className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
          <ArrowLeft className="h-4 w-4" />К зданиям
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm text-slate-500 dark:text-slate-400">{floor.building.name}</span>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          {floor.name}
          {isZone && (
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              floor.kind === "ROOF"
                ? "bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300"
                : "bg-lime-100 dark:bg-lime-500/20 text-lime-700 dark:text-lime-300",
            )}>
              {FLOOR_KIND_LABEL[floor.kind as FloorKind]}
            </span>
          )}
        </h1>
      </div>

      <FloorTabs floorId={floor.id} />

      {children}
    </div>
  )
}
