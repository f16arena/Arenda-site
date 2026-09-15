"use server"

import { revalidatePath, revalidateTag } from "next/cache"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { assertFloorInOrg } from "@/lib/scope-guards"
import { floorsForBuildingTag } from "@/lib/admin-shell-cache"
import { isLayoutV2 } from "@/lib/floor-layout"
import { generateSchemaLayout } from "@/lib/indoor-map/generate"

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
  if (!floor) throw new Error("Этаж не найден")

  if (!replace && floor.layoutJson) {
    try {
      const parsed: unknown = JSON.parse(floor.layoutJson)
      // Перезаписать схему схемой можно молча, нарисованный план — только с подтверждением
      if (isLayoutV2(parsed) && parsed.source !== "schema" && parsed.elements.length > 0) {
        return { success: false, reason: "has-plan" }
      }
    } catch {
      // Битый JSON перезаписываем без вопросов
    }
  }

  const layout = generateSchemaLayout(floor.spaces)
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
