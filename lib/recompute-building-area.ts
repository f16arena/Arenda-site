// Building.totalArea — автоматически = Σ Floor.totalArea.
// Эта функция вызывается после любого изменения этажа (create/update/delete),
// чтобы поле Building.totalArea оставалось в синхроне с этажами.

import { db } from "@/lib/db"

export async function recomputeBuildingArea(buildingId: string): Promise<number> {
  const floors = await db.floor.findMany({
    where: { buildingId },
    select: { totalArea: true },
  })
  const sum = floors.reduce((s, f) => s + (f.totalArea ?? 0), 0)
  const rounded = sum > 0 ? Math.round(sum * 10) / 10 : null
  await db.building.update({
    where: { id: buildingId },
    data: { totalArea: rounded },
  })
  return rounded ?? 0
}
