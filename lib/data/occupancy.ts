import "server-only"
import { db } from "@/lib/db"
import { isZoneFloor } from "@/lib/zone-kinds"

// Заполняемость — ОДНА формула для обзора, аналитики и списка зданий.
// Раньше было 9 разных: где-то по штукам, где-то по м², где-то с общими
// зонами (коридоры) и антеннами на крыше, где-то без них.
//
// Правила:
//  • считаются только сдаваемые помещения (Space.kind = RENTABLE) на обычных этажах;
//  • общие зоны (COMMON), объекты без площади (OBJECT: антенна, щит, киоск-место)
//    и зоны крыша/территория — отдельно (objects), в процент не входят;
//  • этаж, сданный целиком, — все его помещения заняты;
//  • основной процент — по площади (м²): 1 кабинет 10 м² ≠ 1 этаж 600 м².

export type OccupancyStats = {
  totalArea: number
  occupiedArea: number
  vacantArea: number
  /** Ремонт / бронь (MAINTENANCE) — не занято и не свободно для сдачи */
  maintenanceArea: number
  rentableCount: number
  occupiedCount: number
  vacantCount: number
  /** Процент занятой площади, 0–100 */
  pct: number
  /** Объекты без площади и места на крыше/территории */
  objects: { total: number; occupied: number }
}

function empty(): OccupancyStats {
  return {
    totalArea: 0, occupiedArea: 0, vacantArea: 0, maintenanceArea: 0,
    rentableCount: 0, occupiedCount: 0, vacantCount: 0, pct: 0,
    objects: { total: 0, occupied: 0 },
  }
}

export async function getOccupancy(buildingIds: string[]): Promise<{ total: OccupancyStats; byBuilding: Map<string, OccupancyStats> }> {
  const byBuilding = new Map(buildingIds.map((id) => [id, empty()]))
  const total = empty()
  if (buildingIds.length === 0) return { total, byBuilding }

  const spaces = await db.space.findMany({
    where: { floor: { buildingId: { in: buildingIds } }, kind: { not: "COMMON" } },
    select: {
      area: true,
      status: true,
      kind: true,
      floor: { select: { buildingId: true, kind: true, fullFloorTenantId: true } },
    },
  })

  for (const sp of spaces) {
    const b = byBuilding.get(sp.floor.buildingId)
    if (!b) continue
    const rentedByFloor = !!sp.floor.fullFloorTenantId
    const occupied = rentedByFloor || sp.status === "OCCUPIED"
    if (sp.kind !== "RENTABLE" || isZoneFloor(sp.floor.kind)) {
      for (const s of [b, total]) {
        s.objects.total += 1
        if (occupied) s.objects.occupied += 1
      }
      continue
    }
    const area = sp.area > 0 ? sp.area : 0
    for (const s of [b, total]) {
      s.rentableCount += 1
      s.totalArea += area
      if (occupied) { s.occupiedCount += 1; s.occupiedArea += area }
      else if (sp.status === "MAINTENANCE") s.maintenanceArea += area
      else { s.vacantCount += 1; s.vacantArea += area }
    }
  }

  for (const s of [total, ...byBuilding.values()]) {
    s.pct = s.totalArea > 0 ? Math.round((s.occupiedArea / s.totalArea) * 100) : 0
  }
  return { total, byBuilding }
}
