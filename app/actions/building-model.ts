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
import { getT } from "@/lib/i18n/server"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingAccess } from "@/lib/building-access"
import { parseDocument, type Floor } from "@/types/builder"
import { buildProjectFromBuilding, type SourceBuilding } from "@/lib/builder/from-building"

async function loadSourceBuilding(buildingId: string, orgId: string): Promise<SourceBuilding & { name: string }> {
  const { t } = await getT()
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
  if (!building) throw new Error(t("actions.builder.buildingNotFound"))
  return building
}

/**
 * Собрать этаж заново из данных здания — «сброс к данным», когда этаж в модели
 * испорчен (утащили узел, снесли стену). Возвращает свежий этаж; в документ его
 * кладёт клиент командой ReplaceFloorCommand, так что сброс откатывается Ctrl+Z.
 */
export async function rebuildModelFloor(buildingId: string, level: number): Promise<Floor | null> {
  const { t } = await getT()
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") throw new Error(t("actions.builder.forbidden"))
  const { orgId } = await requireOrgAccess()
  await assertBuildingAccess(buildingId, orgId)
  const building = await loadSourceBuilding(buildingId, orgId)
  // Сброс собирает этаж из помещений, а не из сохранённого плана: план этажа
  // пишется из модели при каждом сохранении, и сборка по нему возвращала тот же
  // испорченный контур. Высота этажа из плана сохраняется.
  const fromSpaces = {
    ...building,
    floors: building.floors.map((f) => ({ ...f, layoutJson: keepHeightOnly(f.layoutJson) })),
  }
  const { doc } = buildProjectFromBuilding(fromSpaces)
  const validated = parseDocument(doc)
  return validated.buildings.flatMap((b) => b.floors).find((f) => f.level === level) ?? null
}

function keepHeightOnly(raw: string | null): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { ceilingHeight?: number | null }
    return JSON.stringify({ version: 2, width: 1, height: 1, ceilingHeight: parsed.ceilingHeight ?? null, elements: [] })
  } catch {
    return null
  }
}

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
  const { t } = await getT()
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") throw new Error(t("actions.builder.forbidden"))
  const { orgId } = await requireOrgAccess()
  await assertBuildingAccess(buildingId, orgId)

  const building = await loadSourceBuilding(buildingId, orgId)

  const existing = await db.builderProject.findFirst({
    where: { organizationId: orgId, buildingId: building.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true },
  })
  if (existing) {
    // Наследие снимков: «БЦ F16 — из данных». Модель одна — зовём её как здание.
    if (existing.name !== building.name && /— из данных$/.test(existing.name)) {
      await db.builderProject.update({
        where: { id: existing.id },
        data: { name: building.name.slice(0, 120) },
      })
    }
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
