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

/**
 * Лист чертежа плана этажа из модели здания: размеры, оси, помещения, штамп.
 * Печать в PDF и выгрузка DXF для AutoCAD.
 */
export default async function BuildingSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ buildingId: string }>
  searchParams: Promise<{ floor?: string; dbFloor?: string }>
}) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { buildingId } = await params
  const { floor, dbFloor } = await searchParams
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

  return (
    <FloorSheet
      buildingId={buildingId}
      buildingName={building?.name ?? model.buildingName}
      address={building?.documentAddress || building?.address || ""}
      author={session.user.name ?? ""}
      floors={floors}
      initialFloorId={initial?.id ?? null}
      premiseNumbers={Object.fromEntries(premises.map((p) => [p.id, p.number]))}
    />
  )
}
