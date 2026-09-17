"use server"

import { db } from "@/lib/db"
import { revalidatePath, revalidateTag } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireOrgFeature, requireCapabilityAndFeature } from "@/lib/capabilities"
import { assertFloorInOrg, assertBuildingInOrg } from "@/lib/scope-guards"
import { assertBuildingAccess } from "@/lib/building-access"
import { assertFloorFitsSpaces } from "@/lib/area-validation"
import { recomputeBuildingArea } from "@/lib/recompute-building-area"
import { buildingsForOrgTag, floorsForBuildingTag } from "@/lib/admin-shell-cache"
import { parseDocument } from "@/types/builder"

export type SaveFloorLayoutResult = {
  success: true
  buildingId: string
  sumFloorArea: number   // Σ Floor.totalArea по зданию (после сохранения)
  buildingTotalArea: number | null
  /** true, если Σ этажей > Building.totalArea ⇒ имеет смысл предложить апдейт здания */
  buildingNeedsUpdate: boolean
}

export async function saveFloorLayout(
  floorId: string,
  layoutJson: string,
  totalArea?: number | null,
): Promise<SaveFloorLayoutResult> {
  const { orgId } = await requireOrgAccess()
  await requireOrgFeature(orgId, "floorEditor")
  await assertFloorInOrg(floorId, orgId)

  const floor = await db.floor.findUnique({
    where: { id: floorId },
    select: { buildingId: true },
  })
  if (!floor) throw new Error("Этаж не найден")
  // Орг-скоупа мало: план этажа правит только тот, кому открыто здание
  await assertBuildingAccess(floor.buildingId, orgId)

  // Если меняется totalArea — валидируем что не меньше Σ Space.area
  if (totalArea !== undefined) {
    await assertFloorFitsSpaces({ floorId, newTotalArea: totalArea ?? null })
  }

  await db.floor.update({
    where: { id: floorId },
    data: {
      layoutJson,
      ...(totalArea !== undefined ? { totalArea: totalArea ?? null } : {}),
    },
  })

  // Если изменилась totalArea — пересчитываем Building.totalArea
  let buildingTotalArea: number | null = null
  if (totalArea !== undefined) {
    buildingTotalArea = await recomputeBuildingArea(floor.buildingId)
  }

  revalidatePath("/admin/spaces")
  revalidatePath(`/admin/buildings`)
  revalidatePath(`/admin/floors/${floorId}`)
  revalidateTag(floorsForBuildingTag(floor.buildingId), { expire: 0 })
  if (totalArea !== undefined) {
    revalidateTag(buildingsForOrgTag(orgId), { expire: 0 })
  }
  return {
    success: true,
    buildingId: floor.buildingId,
    sumFloorArea: buildingTotalArea ?? 0,
    buildingTotalArea,
    buildingNeedsUpdate: false,
  }
}

/**
 * Удалить с этажа план или только скан-подложку.
 *
 * План этажа и 3D-модель — одна геометрия: план выводится из модели при каждом
 * сохранении конструктора. Поэтому удаляем в обоих местах, иначе следующее
 * сохранение модели вернуло бы удалённое. Площади и помещения (Space) не
 * трогаем — это данные договоров, а не рисунок. Ревизия модели растёт: открытая
 * вкладка конструктора получит «Конфликт версий» и не затрёт удаление молча.
 */
export async function deleteFloorPlan(floorId: string, what: "plan" | "scan") {
  await requireCapabilityAndFeature("floors.edit")
  const { orgId } = await requireOrgAccess()
  await assertFloorInOrg(floorId, orgId)
  const floor = await db.floor.findUnique({
    where: { id: floorId },
    select: { buildingId: true, number: true, layoutJson: true },
  })
  if (!floor) throw new Error("Этаж не найден")
  await assertBuildingAccess(floor.buildingId, orgId)

  let layoutJson: string | null = null
  if (what === "scan" && floor.layoutJson) {
    try {
      const parsed = JSON.parse(floor.layoutJson) as Record<string, unknown>
      delete parsed.underlay
      delete parsed.underlayUrl
      layoutJson = JSON.stringify(parsed)
    } catch {
      layoutJson = floor.layoutJson
    }
  }
  await db.floor.update({ where: { id: floorId }, data: { layoutJson } })

  const project = await db.builderProject.findFirst({
    where: { organizationId: orgId, buildingId: floor.buildingId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, doc: true, revision: true },
  })
  if (project) {
    const doc = parseDocument(project.doc)
    let changed = false
    for (const building of doc.buildings) {
      building.floors = building.floors.map((f) => {
        const same = f.sourceFloorId ? f.sourceFloorId === floorId : f.level === floor.number
        if (!same) return f
        changed = true
        if (what === "scan") return { ...f, underlay: undefined }
        return { ...f, underlay: undefined, wallGraph: { nodes: {}, edges: {} }, openings: [], stairs: [], objects: [], premiseLinks: {}, roomMaterials: {} }
      })
    }
    if (changed) {
      await db.builderProject.update({
        where: { id: project.id },
        data: { doc: parseDocument(doc), revision: project.revision + 1 },
      })
    }
  }

  revalidatePath(`/admin/buildings/${floor.buildingId}/map`)
  revalidateTag(floorsForBuildingTag(floor.buildingId), { expire: 0 })
  return { success: true }
}

/**
 * Установить Building.totalArea = Σ Floor.totalArea для всех этажей здания.
 * Используется в UI как «применить площадь по этажам к зданию».
 */
export async function setBuildingAreaFromFloors(buildingId: string) {
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)

  const floors = await db.floor.findMany({
    where: { buildingId },
    select: { totalArea: true },
  })
  const sum = floors.reduce((s, f) => s + (f.totalArea ?? 0), 0)
  if (sum <= 0) {
    throw new Error("Ни у одного этажа не задана площадь")
  }

  await db.building.update({
    where: { id: buildingId },
    data: { totalArea: Math.round(sum * 10) / 10 },
  })

  revalidatePath("/admin/buildings")
  revalidatePath("/admin/spaces")
  revalidateTag(buildingsForOrgTag(orgId), { expire: 0 })
  return { success: true, totalArea: Math.round(sum * 10) / 10 }
}
