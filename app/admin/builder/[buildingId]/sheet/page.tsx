export const dynamic = "force-dynamic"

import { notFound, redirect } from "next/navigation"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingAccess } from "@/lib/building-access"
import { openBuildingModel } from "@/app/actions/building-model"
import { loadBuilderProject } from "@/app/actions/builder"
import { listBuildingPremises } from "@/app/actions/builder-premise"
import { FloorSheet } from "@/components/builder/sheet/FloorSheet"
import { SheetAlbum } from "@/components/builder/sheet/SheetAlbum"
import type { SheetSection } from "@/lib/builder/drawing/mep-drawing"

/**
 * Лист чертежа плана этажа из модели здания: размеры, оси, помещения, штамп.
 * Печать в PDF и выгрузка DXF для AutoCAD.
 */

// ЭМ, ЭО, СС, ВК, ОВ — марки комплектов чертежей по ГОСТ, а не подписи для
// экрана: это значения параметра адреса, переводить их нельзя.
const SHEET_SECTIONS: string[] = ["ar", "mep", "ЭМ", "ЭО", "СС", "ВК", "ОВ"]
export default async function BuildingSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ buildingId: string }>
  searchParams: Promise<{ floor?: string; dbFloor?: string; section?: string; view?: string; album?: string }>
}) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { buildingId } = await params
  const { floor, dbFloor, section, view, album } = await searchParams
  const { orgId } = await requireOrgAccess()
  await assertBuildingAccess(buildingId, orgId)

  let model
  try {
    model = await openBuildingModel(buildingId)
  } catch {
    notFound()
  }
  const project = await loadBuilderProject(model.projectId)
  if (!project) notFound()
  const building = await db.building.findFirst({
    where: { id: buildingId, organizationId: orgId },
    select: { name: true, address: true, documentAddress: true },
  })
  const premises = await listBuildingPremises(buildingId)

  const floors = project.doc.buildings.flatMap((b) => b.floors).sort((a, b) => a.level - b.level)
  const initial =
    floors.find((f) => f.id === floor) ??
    floors.find((f) => dbFloor && f.sourceFloorId === dbFloor) ??
    floors.find((f) => f.level === 1) ??
    floors[0]

  const albumBuilding = project.doc.buildings.find((b) => b.floors.some((f) => f.id === initial?.id)) ?? project.doc.buildings[0]
  if (album && albumBuilding) {
    return (
      <SheetAlbum
        buildingId={buildingId}
        buildingName={building?.name ?? model.buildingName}
        address={building?.documentAddress || building?.address || ""}
        author={session.user.name ?? ""}
        building={albumBuilding}
        premiseNumbers={Object.fromEntries(premises.map((p) => [p.id, p.number]))}
        site={project.doc.site}
        allBuildings={project.doc.buildings}
      />
    )
  }

  return (
    <FloorSheet
      buildingId={buildingId}
      buildingName={building?.name ?? model.buildingName}
      address={building?.documentAddress || building?.address || ""}
      author={session.user.name ?? ""}
      floors={floors}
      initialFloorId={initial?.id ?? null}
      premiseNumbers={Object.fromEntries(premises.map((p) => [p.id, p.number]))}
      building={project.doc.buildings.find((b) => b.floors.some((f) => f.id === initial?.id)) ?? project.doc.buildings[0]}
      site={project.doc.site}
      allBuildings={project.doc.buildings}
      initialView={view && /^(plan|evac|finish|roof|site|slabs|replan:(demolish|install|after)|facade:(south|north|west|east)|section:[\w-]+)$/.test(view) ? view : "plan"}
      initialSection={section && SHEET_SECTIONS.includes(section) ? (section as SheetSection) : "ar"}
    />
  )
}
