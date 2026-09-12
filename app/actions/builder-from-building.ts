"use server"

// ADR: Сборка проекта Building Studio из данных здания. Генерация в одну сторону:
// читаем этажи, помещения и планы этажей, пишем новый BuilderProject. Ничего в
// Floor/Space не меняем — площадь помещения это условие договора, менять её
// движением стены в 3D нельзя. Расхождения возвращаем в отчёте.

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { parseDocument } from "@/types/builder"
import { buildProjectFromBuilding, type BuildReport, type SourceBuilding } from "@/lib/builder/from-building"

async function requireBuilderAccess(): Promise<string> {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") throw new Error("Запрещено")
  const { orgId } = await requireOrgAccess()
  return orgId
}

export type BuildableBuilding = {
  id: string
  name: string
  floors: number
  spaces: number
  floorsWithPlan: number
}

/** Здания организации со сводкой: есть ли из чего строить модель. */
export async function listBuildableBuildings(): Promise<BuildableBuilding[]> {
  const orgId = await requireBuilderAccess()
  const buildings = await db.building.findMany({
    where: { organizationId: orgId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      floors: {
        select: { id: true, kind: true, layoutJson: true, _count: { select: { spaces: true } } },
      },
    },
  })
  return buildings.map((b) => {
    const floors = b.floors.filter((f) => f.kind !== "TERRITORY")
    return {
      id: b.id,
      name: b.name,
      floors: floors.length,
      spaces: b.floors.reduce((sum, f) => sum + f._count.spaces, 0),
      floorsWithPlan: floors.filter((f) => !!f.layoutJson).length,
    }
  })
}

export async function createProjectFromBuilding(
  buildingId: string,
): Promise<{ id: string; report: BuildReport }> {
  const orgId = await requireBuilderAccess()
  const session = await auth()

  const building = await db.building.findFirst({
    where: { id: buildingId, organizationId: orgId },
    select: {
      id: true,
      name: true,
      floors: {
        orderBy: { number: "asc" },
        select: {
          id: true,
          number: true,
          name: true,
          kind: true,
          totalArea: true,
          layoutJson: true,
          spaces: {
            orderBy: { number: "asc" },
            select: { id: true, number: true, area: true, kind: true },
          },
        },
      },
    },
  })
  if (!building) throw new Error("Здание не найдено")

  const source: SourceBuilding = building
  const { doc, report } = buildProjectFromBuilding(source)
  if (report.floorsExact === 0 && report.floorsApprox === 0) {
    throw new Error("У здания нет ни планов этажей, ни помещений с площадью — строить нечего")
  }

  const validated = parseDocument(doc)
  const created = await db.builderProject.create({
    data: {
      organizationId: orgId,
      name: `${building.name} — из данных`.slice(0, 120),
      buildingId: building.id,
      doc: validated,
      schemaVersion: validated.schemaVersion,
      revision: 0,
      createdById: session?.user?.id ?? null,
    },
    select: { id: true },
  })

  return { id: created.id, report }
}
