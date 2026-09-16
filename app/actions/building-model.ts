"use server"

// Модель здания в конструкторе: одна на здание.
//
// Раньше каждая сборка создавала новый BuilderProject-снимок, и у одного БЦ
// копилось семь одинаковых записей. Теперь у здания ровно одна модель:
// первый вход собирает её из данных (этажи, помещения, планы), дальше она
// живёт и сохраняется на месте. Владелец строит сам — ничего за него не
// перестраивается без явной команды.

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingAccess } from "@/lib/building-access"
import { parseDocument } from "@/types/builder"
import { buildProjectFromBuilding, type SourceBuilding } from "@/lib/builder/from-building"

export type BuildingModel = {
  projectId: string
  buildingId: string
  buildingName: string
  /** модель только что собрана из данных — первый вход */
  created: boolean
}

/**
 * Найти модель здания или собрать её один раз из данных.
 * Если снимков-проектов несколько (наследие), берём последний сохранённый.
 */
export async function openBuildingModel(buildingId: string): Promise<BuildingModel> {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") throw new Error("Запрещено")
  const { orgId } = await requireOrgAccess()
  await assertBuildingAccess(buildingId, orgId)

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

  const existing = await db.builderProject.findFirst({
    where: { organizationId: orgId, buildingId: building.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  })
  if (existing) {
    return { projectId: existing.id, buildingId: building.id, buildingName: building.name, created: false }
  }

  // Первый вход: собираем стартовую модель из того, что уже введено.
  // Если данных нет вовсе — модель пустая, строить с нуля можно и так.
  const source: SourceBuilding = building
  const { doc } = buildProjectFromBuilding(source)
  const validated = parseDocument(doc)
  const created = await db.builderProject.create({
    data: {
      organizationId: orgId,
      name: building.name.slice(0, 120),
      buildingId: building.id,
      doc: validated,
      schemaVersion: validated.schemaVersion,
      revision: 0,
      createdById: session.user.id,
    },
    select: { id: true },
  })
  return { projectId: created.id, buildingId: building.id, buildingName: building.name, created: true }
}
