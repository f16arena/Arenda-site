// Помещения этажа с чистой площадью. Граф стен задаёт оси, а площадь помещения
// по ГОСТ и БТИ считается по внутренним граням: контур грани графа поджимается
// внутрь на полтолщины каждой стены (у вложенных островов — наоборот, наружу).
// Затем вычитаются колонны: утопленная в стену колонна вычитается только
// выступающей частью.

import type { Floor } from "@/types/builder"
import { detectRooms, type Room } from "@/core/geometry/room-detection"
import { polygonArea, type Vec2 } from "@/core/geometry/math"
import type { WallGraph } from "@/core/geometry/wall-graph"
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
  const g = floor.wallGraph
  const rooms = detectRooms(g)
  const byId = new Map(rooms.map((r) => [r.id, r]))
  const columns = (floor.stairs ?? []).filter((s) => s.shape === "column").map((s) => stairHoleWorld(s, floor.height))
  return rooms.map((r) => {
    const polygon = offsetLoop(g, r.nodeLoop, r.polygon, 1)
    // острова внутри (санузел в коридоре): их наружная грань — тоже по граням стен
    const holes = (r.holes ?? []).map((h) => {
      const inner = rooms.find((x) => x !== r && x.polygon.length === h.length && x.polygon[0].x === h[0].x && x.polygon[0].y === h[0].y)
      return inner ? offsetLoop(g, inner.nodeLoop, inner.polygon, -1) : h
    })
    const area = polygon.length >= 3 ? polygonArea(polygon) - holes.reduce((s, h) => s + (h.length >= 3 ? polygonArea(h) : 0), 0) : r.areaMm2
    const shaped = { ...r, polygon, holes: holes.length ? holes : undefined, areaMm2: Math.max(0, area) }
    const cols = columns.reduce((sum, c) => sum + areaInside(c, shaped), 0)
    void byId
    return { ...shaped, areaMm2: Math.max(0, shaped.areaMm2 - cols), columnsMm2: cols }
  })
}

/** Толщина стены между двумя узлами графа (0 — стены нет). */
function thicknessBetween(g: WallGraph, a: string, b: string): number {
  for (const id in g.edges) {
    const e = g.edges[id]
    if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return e.thickness
  }
  return 0
}

/**
 * Контур по внутренним граням: каждая сторона сдвигается на полтолщины своей
 * стены, углы — пересечение соседних сдвинутых прямых. sign = 1 — внутрь
 * помещения, −1 — наружу (для острова внутри помещения).
 */
export function offsetLoop(g: WallGraph, loop: string[], polygon: Vec2[], sign: 1 | -1): Vec2[] {
  const n = polygon.length
  if (n < 3 || loop.length !== n) return polygon
  // грань помещения обходится против часовой: внутренняя сторона — слева
  let area2 = 0
  for (let i = 0; i < n; i++) { const p = polygon[i], q = polygon[(i + 1) % n]; area2 += p.x * q.y - q.x * p.y }
  const ccw = area2 > 0
  const lines = polygon.map((p, i) => {
    const q = polygon[(i + 1) % n]
    const dx = q.x - p.x, dy = q.y - p.y
    const L = Math.hypot(dx, dy) || 1
    const u = { x: dx / L, y: dy / L }
    // нормаль влево от направления обхода
    const nr = ccw ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x }
    const d = (thicknessBetween(g, loop[i], loop[(i + 1) % n]) / 2) * sign
    return { p: { x: p.x + nr.x * d, y: p.y + nr.y * d }, u }
  })
  const out: Vec2[] = []
  for (let i = 0; i < n; i++) {
    const prev = lines[(i - 1 + n) % n], cur = lines[i]
    const det = prev.u.x * -cur.u.y - prev.u.y * -cur.u.x
    if (Math.abs(det) < 1e-9) { out.push(cur.p); continue }
    const rx = cur.p.x - prev.p.x, ry = cur.p.y - prev.p.y
    const t = (rx * -cur.u.y - ry * -cur.u.x) / det
    out.push({ x: prev.p.x + prev.u.x * t, y: prev.p.y + prev.u.y * t })
  }
  return out
}
