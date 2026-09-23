"use server"

import { revalidatePath, revalidateTag } from "next/cache"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { assertBuildingInOrg, assertFloorInOrg } from "@/lib/scope-guards"
import { assertBuildingAccess } from "@/lib/building-access"
import { floorsForBuildingTag } from "@/lib/admin-shell-cache"
import { layoutKind } from "@/lib/indoor-map/layout-source"
import { buildingFootprint, generateSchemaLayout } from "@/lib/indoor-map/generate"
import { getT } from "@/lib/i18n/server"

export type GenerateSchemaResult =
  | { success: true; rooms: number }
  | { success: false; reason: "no-spaces" | "has-plan" }

/**
 * Собрать схему этажа из его помещений и сохранить как план.
 *
 * Нарисованный план не затирается: если у этажа уже есть геометрия, действие
 * возвращает "has-plan" и интерфейс спрашивает подтверждение через `replace`.
 */
export async function generateFloorSchema(
  floorId: string,
  replace = false,
): Promise<GenerateSchemaResult> {
  const { t } = await getT()
  await requireCapabilityAndFeature("floors.edit")
  const { orgId } = await requireOrgAccess()
  await assertFloorInOrg(floorId, orgId)

  const floor = await db.floor.findUnique({
    where: { id: floorId },
    select: {
      buildingId: true,
      layoutJson: true,
      spaces: { select: { id: true, number: true, area: true, kind: true } },
    },
  })
  if (!floor) throw new Error(t("actions.common.floorNotFound"))
  await assertBuildingAccess(floor.buildingId, orgId)

  if (!replace && layoutKind(floor.layoutJson) === "drawn") {
    return { success: false, reason: "has-plan" }
  }

  // Контур один на всё здание: иначе этажи выходят разного размера
  // и стопка перестаёт быть зданием
  const siblings = await db.floor.findMany({
    where: { buildingId: floor.buildingId },
    select: { spaces: { select: { area: true } } },
  })
  const footprint = buildingFootprint(
    siblings.map((item) => item.spaces.reduce((sum, space) => sum + space.area, 0)),
  )
  const layout = generateSchemaLayout(floor.spaces, { footprint })
  if (!layout) return { success: false, reason: "no-spaces" }

  await db.floor.update({
    where: { id: floorId },
    data: { layoutJson: JSON.stringify(layout) },
  })

  revalidatePath(`/admin/buildings/${floor.buildingId}/map`)
  revalidatePath(`/admin/floors/${floorId}`)
  revalidateTag(floorsForBuildingTag(floor.buildingId), { expire: 0 })

  return { success: true, rooms: floor.spaces.length }
}


export type GenerateBuildingSchemasResult = {
  success: true
  /** для скольких этажей схема собрана */
  built: number
  /** этажи, где собирать было не из чего */
  skipped: number
}

/**
 * Собрать схемы сразу для всех этажей здания, у которых нет нарисованного
 * плана. Заводить объект по одному этажу — шесть кликов вместо одного.
 * Нарисованные планы не трогаются никогда.
 */
export async function generateBuildingSchemas(
  buildingId: string,
): Promise<GenerateBuildingSchemasResult> {
  await requireCapabilityAndFeature("floors.edit")
  const { orgId } = await requireOrgAccess()
  await assertBuildingInOrg(buildingId, orgId)
  await assertBuildingAccess(buildingId, orgId)

  const floors = await db.floor.findMany({
    where: { buildingId },
    select: {
      id: true,
      layoutJson: true,
      spaces: { select: { id: true, number: true, area: true, kind: true } },
    },
  })

  const footprint = buildingFootprint(
    floors.map((floor) => floor.spaces.reduce((sum, space) => sum + space.area, 0)),
  )
  let built = 0
  let skipped = 0
  for (const floor of floors) {
    if (layoutKind(floor.layoutJson) === "drawn") {
      skipped += 1
      continue
    }
    const layout = generateSchemaLayout(floor.spaces, { footprint })
    if (!layout) {
      skipped += 1
      continue
    }
    await db.floor.update({
      where: { id: floor.id },
      data: { layoutJson: JSON.stringify(layout) },
    })
    built += 1
  }

  revalidatePath(`/admin/buildings/${buildingId}/map`)
  revalidateTag(floorsForBuildingTag(buildingId), { expire: 0 })
  return { success: true, built, skipped }
}
