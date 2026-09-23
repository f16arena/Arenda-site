// План перекрытия (схема расположения плит): плиты кладутся поперёк короткой
// стороны помещения на несущие стены (наружные и внутренние от 200 мм), с
// опиранием 120 мм. Непрямоугольные и слишком большие пролёты отмечаются как
// монолитные участки — их считает конструктор отдельно.

import type { Floor } from "@/types/builder"
import { floorRooms } from "@/lib/builder/rooms"
import { roomUse } from "@/lib/builder/room-use"
import type { Vec2 } from "@/core/geometry/math"

export interface SlabPiece {
  /** прямоугольник плиты в плане (мм) */
  rect: Vec2[]
  /** марка: ПК 60-12 (длина в дм, ширина в дм) */
  mark: string
}

export interface SlabRow {
  mark: string
  lengthMm: number
  widthMm: number
  count: number
}

export interface SlabPlan {
  slabs: SlabPiece[]
  /** участки, которые плитами не перекрыть — монолит */
  monolith: Vec2[][]
  rows: SlabRow[]
  /** суммарная площадь перекрытия плитами, м² */
  slabAreaM2: number
  /** опирание плиты на стену, мм */
  bearing: number
}

const BEARING = 120
const WIDTHS = [1500, 1200, 1000, 800]
const MAX_SPAN = 9000
const MIN_SIDE = 1500

function bbox(poly: Vec2[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of poly) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
}

/** Прямоугольное ли помещение: 4 угла и площадь совпадает с габаритом. */
function isRect(poly: Vec2[], areaMm2: number): boolean {
  if (poly.length !== 4) return false
  const b = bbox(poly)
  return Math.abs(b.w * b.h - areaMm2) / Math.max(1, areaMm2) < 0.02
}

/** Разбить длину на стандартные ширины плит; остаток — монолитная вставка. */
function layWidths(total: number): { widths: number[]; rest: number } {
  const widths: number[] = []
  let left = total
  while (left >= WIDTHS[WIDTHS.length - 1]) {
    const w = WIDTHS.find((x) => x <= left)
    if (!w) break
    widths.push(w)
    left -= w
  }
  return { widths, rest: left }
}

export function buildSlabPlan(floor: Floor): SlabPlan {
  const slabs: SlabPiece[] = []
  const monolith: Vec2[][] = []
  const rows = new Map<string, SlabRow>()
  let area = 0

  for (const r of floorRooms(floor)) {
    // шахты лифтов и лестничные клетки перекрываются отдельно
    if (roomUse(floor, r) !== "rent" && /лифт|лестн|лифт|баспалдақ/i.test(floor.roomNames?.[r.id] ?? "")) continue
    const b = bbox(r.polygon)
    if (b.w < MIN_SIDE || b.h < MIN_SIDE) continue
    const span = Math.min(b.w, b.h)
    if (!isRect(r.polygon, r.areaMm2) || span > MAX_SPAN) {
      monolith.push(r.polygon)
      continue
    }
    const alongX = b.w > b.h // плиты укладываются вдоль длинной стороны
    const slabLen = Math.round((span + BEARING * 2) / 100) * 100
    const { widths, rest } = layWidths(alongX ? b.w : b.h)
    let cursor = alongX ? b.minX : b.minY
    for (const wdt of widths) {
      const rect: Vec2[] = alongX
        ? [
            { x: cursor, y: b.minY - BEARING },
            { x: cursor + wdt, y: b.minY - BEARING },
            { x: cursor + wdt, y: b.maxY + BEARING },
            { x: cursor, y: b.maxY + BEARING },
          ]
        : [
            { x: b.minX - BEARING, y: cursor },
            { x: b.maxX + BEARING, y: cursor },
            { x: b.maxX + BEARING, y: cursor + wdt },
            { x: b.minX - BEARING, y: cursor + wdt },
          ]
      const mark = `ПК ${Math.round(slabLen / 100)}-${Math.round(wdt / 100)}`
      slabs.push({ rect, mark })
      const row = rows.get(mark) ?? { mark, lengthMm: slabLen, widthMm: wdt, count: 0 }
      row.count += 1
      rows.set(mark, row)
      area += (slabLen / 1000) * (wdt / 1000)
      cursor += wdt
    }
    if (rest > 50) {
      const rect: Vec2[] = alongX
        ? [
            { x: cursor, y: b.minY },
            { x: b.maxX, y: b.minY },
            { x: b.maxX, y: b.maxY },
            { x: cursor, y: b.maxY },
          ]
        : [
            { x: b.minX, y: cursor },
            { x: b.maxX, y: cursor },
            { x: b.maxX, y: b.maxY },
            { x: b.minX, y: b.maxY },
          ]
      monolith.push(rect)
    }
  }

  return {
    slabs,
    monolith,
    rows: [...rows.values()].sort((a, b2) => b2.lengthMm - a.lengthMm || b2.widthMm - a.widthMm),
    slabAreaM2: Math.round(area * 10) / 10,
    bearing: BEARING,
  }
}
