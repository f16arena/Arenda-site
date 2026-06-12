/**
 * Типы «этажей» и «помещений» для крыши/территории.
 *
 * Этаж (Floor.kind) бывает трёх видов:
 *   FLOOR     — обычный этаж здания (входит в площадь здания);
 *   ROOF      — крыша (зона, НЕ входит в площадь здания);
 *   TERRITORY — прилегающая территория: двор, парковка, открытые площадки
 *               (зона, НЕ входит в площадь здания).
 *
 * На зонах (ROOF/TERRITORY) сдаются ОБЪЕКТЫ — помещения без квадратных метров
 * (Space.kind = OBJECT, area = 0): антенно-мачтовые сооружения, рекламные щиты,
 * парковочные места, летние веранды. Они сдаются за фиксированную сумму
 * (Tenant.fixedMonthlyRent), без расчёта «площадь × ставка» и без
 * эксплуатационного сбора (он считается от площади, которой нет).
 *
 * Поля kind в БД — свободные строки (не enum), поэтому новые значения не требуют
 * миграции схемы. Эти хелперы — единственный источник правды по их распознаванию.
 */

export const FLOOR_KINDS = ["FLOOR", "ROOF", "TERRITORY"] as const
export type FloorKind = (typeof FLOOR_KINDS)[number]

/** Зоны — крыша и территория. Не входят в площадь здания. */
export function isZoneFloor(kind: string | null | undefined): boolean {
  return kind === "ROOF" || kind === "TERRITORY"
}

/** Приводит произвольную строку к допустимому Floor.kind. */
export function normalizeFloorKind(raw: string | null | undefined): FloorKind {
  const k = String(raw ?? "FLOOR").trim().toUpperCase()
  return k === "ROOF" ? "ROOF" : k === "TERRITORY" ? "TERRITORY" : "FLOOR"
}

export const FLOOR_KIND_LABEL: Record<FloorKind, string> = {
  FLOOR: "Этаж",
  ROOF: "Крыша",
  TERRITORY: "Территория",
}

/** Помещение-объект без площади (на крыше/территории). Сдаётся фикс-суммой. */
export const SPACE_OBJECT_KIND = "OBJECT"

export function isObjectSpace(kind: string | null | undefined): boolean {
  return kind === SPACE_OBJECT_KIND
}
