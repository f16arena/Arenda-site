// Помещения этажа с чистой площадью: из площади грани графа стен вычитаются
// колонны (их часть внутри помещения — колонна, утопленная в стену, вычитается
// только выступающей частью). Острова стен вычитает сам detectRooms.

import type { Floor } from "@/types/builder"
import { detectRooms, type Room } from "@/core/geometry/room-detection"
import { polygonArea, type Vec2 } from "@/core/geometry/math"
import { stairHoleWorld } from "./stair-hole"

/** Отсечение многоугольника выпуклым многоугольником (Сазерленд — Ходжман). */
function clipByConvex(subject: Vec2[], clip: Vec2[]): Vec2[] {
  let out = subject
  // ориентация отсекателя: внутренняя сторона — слева при CCW
  let area2 = 0
  for (let i = 0; i < clip.length; i++) { const a = clip[i], b = clip[(i + 1) % clip.length]; area2 += a.x * b.y - b.x * a.y }
  const ccw = area2 > 0
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length]
    const inside = (p: Vec2) => {
      const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
      return ccw ? c >= 0 : c <= 0
    }
    const cut = (p: Vec2, q: Vec2): Vec2 => {
      const a1 = b.y - a.y, b1 = a.x - b.x, c1 = a1 * a.x + b1 * a.y
      const a2 = q.y - p.y, b2 = p.x - q.x, c2 = a2 * p.x + b2 * p.y
      const det = a1 * b2 - a2 * b1
      if (Math.abs(det) < 1e-9) return p
      return { x: (b2 * c1 - b1 * c2) / det, y: (a1 * c2 - a2 * c1) / det }
    }
    const input = out
    out = []
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length]
      const pin = inside(p), qin = inside(q)
      if (pin) out.push(p)
      if (pin !== qin) out.push(cut(p, q))
    }
  }
  return out
}

/** Площадь части выпуклого сечения внутри помещения (с учётом дыр). */
export function areaInside(section: Vec2[], room: Pick<Room, "polygon" | "holes">): number {
  // помещение может быть невыпуклым — режем сечение (выпуклое) помещением через обратную схему:
  // отсекаем помещение сечением, это корректно для выпуклого отсекателя
  const inPoly = clipByConvex(room.polygon, section)
  let a = inPoly.length >= 3 ? polygonArea(inPoly) : 0
  for (const h of room.holes ?? []) {
    const inHole = clipByConvex(h, section)
    if (inHole.length >= 3) a -= polygonArea(inHole)
  }
  return Math.max(0, a)
}

export interface FloorRoom extends Room {
  /** площадь колонн внутри помещения, мм² */
  columnsMm2: number
}

/** Помещения этажа: areaMm2 — чистая площадь (минус острова и колонны). */
export function floorRooms(floor: Pick<Floor, "wallGraph" | "stairs" | "height">): FloorRoom[] {
  const rooms = detectRooms(floor.wallGraph)
  const columns = (floor.stairs ?? []).filter((s) => s.shape === "column").map((s) => stairHoleWorld(s, floor.height))
  return rooms.map((r) => {
    const cols = columns.reduce((sum, c) => sum + areaInside(c, r), 0)
    return { ...r, areaMm2: Math.max(0, r.areaMm2 - cols), columnsMm2: cols }
  })
}
