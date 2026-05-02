"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { assertFloorInOrg, assertBuildingInOrg } from "@/lib/scope-guards"
import { assertFloorFitsBuilding, assertFloorFitsSpaces } from "@/lib/area-validation"

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
  await assertFloorInOrg(floorId, orgId)

  const floor = await db.floor.findUnique({
    where: { id: floorId },
    select: { buildingId: true },
  })
  if (!floor) throw new Error("Этаж не найден")

  // Если меняется totalArea — валидируем инварианты
  if (totalArea !== undefined) {
    await assertFloorFitsBuilding({
      buildingId: floor.buildingId,
      newTotalArea: totalArea ?? null,
      excludeFloorId: floorId,
    })
    await assertFloorFitsSpaces({ floorId, newTotalArea: totalArea ?? null })
  }

  await db.floor.update({
    where: { id: floorId },
    data: {
      layoutJson,
      ...(totalArea !== undefined ? { totalArea: totalArea ?? null } : {}),
    },
  })

  // Подсчитаем актуальное состояние здания после апдейта
  const [floors, building] = await Promise.all([
    db.floor.findMany({
      where: { buildingId: floor.buildingId },
      select: { totalArea: true },
    }),
    db.building.findUnique({
      where: { id: floor.buildingId },
      select: { totalArea: true },
    }),
  ])
  const sumFloorArea = floors.reduce((s, f) => s + (f.totalArea ?? 0), 0)
  const buildingTotalArea = building?.totalArea ?? null
  const buildingNeedsUpdate =
    sumFloorArea > 0 && (buildingTotalArea === null || sumFloorArea > buildingTotalArea + 0.05)

  revalidatePath("/admin/spaces")
  revalidatePath(`/admin/buildings`)
  revalidatePath(`/admin/floors/${floorId}`)
  return {
    success: true,
    buildingId: floor.buildingId,
    sumFloorArea,
    buildingTotalArea,
    buildingNeedsUpdate,
  }
}

/**
 * Очистить нарисованный план этажа: layoutJson = null, totalArea = null.
 * Помещения (Space) НЕ затрагиваются — это только визуальный слой.
 * Используется как «начать рисовать с нуля».
 */
export async function clearFloorPlan(floorId: string) {
  const { orgId } = await requireOrgAccess()
  await assertFloorInOrg(floorId, orgId)

  await db.floor.update({
    where: { id: floorId },
    data: { layoutJson: null, totalArea: null },
  })

  revalidatePath("/admin/spaces")
  revalidatePath("/admin/buildings")
  revalidatePath(`/admin/floors/${floorId}`)
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
  return { success: true, totalArea: Math.round(sum * 10) / 10 }
}
