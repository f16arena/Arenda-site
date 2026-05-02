// Жёсткие инварианты площадей:
//   Σ Space.area ≤ Floor.totalArea
//   Σ Floor.totalArea ≤ Building.totalArea
//
// Площадь Space — это арендопригодная площадь (то, что прописано в договоре).
// Floor.totalArea — общая (физическая) площадь этажа из тех. паспорта,
// включая коридоры, санузлы, тех. помещения и стены.
// Building.totalArea — общая физическая площадь здания.
//
// Допуск EPSILON=0.05 м² на ошибки округления.

import { db } from "@/lib/db"

const EPSILON = 0.05

export class AreaConstraintError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AreaConstraintError"
  }
}

/**
 * Проверить, что новая площадь Space помещается в общую площадь этажа.
 * Σ (других Space.area на этом этаже) + newArea ≤ Floor.totalArea
 *
 * Если у этажа нет totalArea — пропускаем (нечего валидировать).
 * Если newArea ≤ 0 — кидаем ошибку.
 */
export async function assertSpaceFitsFloor(opts: {
  floorId: string
  newArea: number
  excludeSpaceId?: string
}): Promise<void> {
  if (!Number.isFinite(opts.newArea) || opts.newArea <= 0) {
    throw new AreaConstraintError("Площадь помещения должна быть положительным числом")
  }

  const floor = await db.floor.findUnique({
    where: { id: opts.floorId },
    select: { totalArea: true, name: true, number: true },
  })
  if (!floor) throw new AreaConstraintError("Этаж не найден")
  if (!floor.totalArea || floor.totalArea <= 0) return // не задана — пропускаем

  const otherSpaces = await db.space.findMany({
    where: {
      floorId: opts.floorId,
      ...(opts.excludeSpaceId ? { id: { not: opts.excludeSpaceId } } : {}),
    },
    select: { area: true },
  })
  const sumOthers = otherSpaces.reduce((s, sp) => s + sp.area, 0)
  const sumNew = sumOthers + opts.newArea

  if (sumNew > floor.totalArea + EPSILON) {
    const free = Math.max(0, floor.totalArea - sumOthers)
    throw new AreaConstraintError(
      `Превышение площади этажа «${floor.name}»: ${sumNew.toFixed(1)} м² > ${floor.totalArea.toFixed(1)} м². ` +
        `Свободно: ${free.toFixed(1)} м². ` +
        `Сначала уменьшите другие помещения или увеличьте «Общую площадь этажа».`,
    )
  }
}

/**
 * Проверить, что новая площадь Floor помещается в общую площадь здания.
 * Σ (других Floor.totalArea в здании) + newTotalArea ≤ Building.totalArea
 *
 * Если у здания нет totalArea — пропускаем.
 * Если newTotalArea null/0 — пропускаем (этаж без площади).
 */
export async function assertFloorFitsBuilding(opts: {
  buildingId: string
  newTotalArea: number | null
  excludeFloorId?: string
}): Promise<void> {
  if (!opts.newTotalArea || opts.newTotalArea <= 0) return

  const building = await db.building.findUnique({
    where: { id: opts.buildingId },
    select: { totalArea: true, name: true },
  })
  if (!building) throw new AreaConstraintError("Здание не найдено")
  if (!building.totalArea || building.totalArea <= 0) return

  const otherFloors = await db.floor.findMany({
    where: {
      buildingId: opts.buildingId,
      ...(opts.excludeFloorId ? { id: { not: opts.excludeFloorId } } : {}),
    },
    select: { totalArea: true },
  })
  const sumOthers = otherFloors.reduce((s, f) => s + (f.totalArea ?? 0), 0)
  const sumNew = sumOthers + opts.newTotalArea

  if (sumNew > building.totalArea + EPSILON) {
    const free = Math.max(0, building.totalArea - sumOthers)
    throw new AreaConstraintError(
      `Превышение площади здания «${building.name}»: ${sumNew.toFixed(1)} м² > ${building.totalArea.toFixed(1)} м². ` +
        `Свободно: ${free.toFixed(1)} м². ` +
        `Сначала уменьшите другие этажи или увеличьте «Общую площадь здания».`,
    )
  }
}

/**
 * При обновлении Building.totalArea убеждаемся, что новое значение ≥ Σ Floor.totalArea
 * (нельзя уменьшить здание ниже того, что уже расписано по этажам).
 */
export async function assertBuildingFitsFloors(opts: {
  buildingId: string
  newTotalArea: number | null
}): Promise<void> {
  if (!opts.newTotalArea || opts.newTotalArea <= 0) return

  const floors = await db.floor.findMany({
    where: { buildingId: opts.buildingId },
    select: { totalArea: true },
  })
  const sumFloors = floors.reduce((s, f) => s + (f.totalArea ?? 0), 0)

  if (opts.newTotalArea + EPSILON < sumFloors) {
    throw new AreaConstraintError(
      `Площадь здания (${opts.newTotalArea.toFixed(1)} м²) меньше суммы площадей этажей (${sumFloors.toFixed(1)} м²). ` +
        `Уменьшите общую площадь этажей или увеличьте площадь здания.`,
    )
  }
}

/**
 * При обновлении Floor.totalArea убеждаемся, что новое значение ≥ Σ Space.area на этаже.
 */
export async function assertFloorFitsSpaces(opts: {
  floorId: string
  newTotalArea: number | null
}): Promise<void> {
  if (!opts.newTotalArea || opts.newTotalArea <= 0) return

  const spaces = await db.space.findMany({
    where: { floorId: opts.floorId },
    select: { area: true },
  })
  const sumSpaces = spaces.reduce((s, sp) => s + sp.area, 0)

  if (opts.newTotalArea + EPSILON < sumSpaces) {
    throw new AreaConstraintError(
      `Общая площадь этажа (${opts.newTotalArea.toFixed(1)} м²) меньше суммы помещений (${sumSpaces.toFixed(1)} м²). ` +
        `Уменьшите площадь помещений или увеличьте общую площадь этажа.`,
    )
  }
}
