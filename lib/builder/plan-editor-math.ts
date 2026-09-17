// Математика редактора плана (2D): вид (масштаб и сдвиг), привязки точек и
// попадание курсора в элементы. Без DOM — тестируется отдельно.

import type { Floor } from "@/types/builder"
import { closestOnSegment, pointInPolygon, type Vec2 } from "@/core/geometry/math"
import { detectRooms } from "@/core/geometry/room-detection"
import { stairHoleWorld } from "./stair-hole"
import { dimGeometry } from "./annotations"

/** Вид: пикселей на мм и положение начала координат плана на экране. Ось Y плана — вверх. */
export interface View {
  k: number
  tx: number
  ty: number
}

export const toScreen = (v: View, p: Vec2): Vec2 => ({ x: p.x * v.k + v.tx, y: -p.y * v.k + v.ty })
export const toPlan = (v: View, s: Vec2): Vec2 => ({ x: (s.x - v.tx) / v.k, y: -(s.y - v.ty) / v.k })

/** Вписать прямоугольник плана (мм) в экран w×h с полями. */
export function fitView(
  b: { minX: number; minY: number; maxX: number; maxY: number },
  w: number,
  h: number,
  pad: number | { left: number; right: number; top: number; bottom: number } = 60,
): View {
  const p = typeof pad === "number" ? { left: pad, right: pad, top: pad, bottom: pad } : pad
  const aw = Math.max(100, w - p.left - p.right), ah = Math.max(100, h - p.top - p.bottom)
  const bw = Math.max(1000, b.maxX - b.minX), bh = Math.max(1000, b.maxY - b.minY)
  const k = Math.min(aw / bw, ah / bh)
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2
  return { k, tx: p.left + aw / 2 - cx * k, ty: p.top + ah / 2 + cy * k }
}

/** Зум колесом вокруг точки экрана. */
export function zoomAt(v: View, s: Vec2, factor: number): View {
  const k = Math.min(2, Math.max(0.002, v.k * factor))
  const p = toPlan(v, s)
  return { k, tx: s.x - p.x * k, ty: s.y + p.y * k }
}

export interface Snap {
  p: Vec2
  kind: "node" | "edge" | "align" | "angle" | "grid" | "free"
  /** направляющие «по линии»: от узла, с которым выровнялись, до точки */
  guides?: Array<{ from: Vec2; to: Vec2 }>
}

/**
 * Точка стены/размера: узел в допуске → точка на стене → угол кратный 15° от
 * предыдущей точки с шагом длины → сетка. snap=false — только узлы и стены.
 */
export function snapPoint(floor: Pick<Floor, "wallGraph">, raw: Vec2, prev: Vec2 | null, tolMm: number, snap: boolean): Snap {
  const g = floor.wallGraph
  let bestNode: { p: Vec2; d: number } | null = null
  for (const id in g.nodes) {
    const n = g.nodes[id]
    const d = Math.hypot(n.x - raw.x, n.y - raw.y)
    if (d <= tolMm && (!bestNode || d < bestNode.d)) bestNode = { p: { x: n.x, y: n.y }, d }
  }
  if (bestNode) return { p: bestNode.p, kind: "node" }
  let bestEdge: { p: Vec2; d: number } | null = null
  for (const id in g.edges) {
    const e = g.edges[id]
    const a = g.nodes[e.a], b = g.nodes[e.b]
    if (!a || !b) continue
    const c = closestOnSegment(raw, a, b)
    if (c.dist <= tolMm && (!bestEdge || c.dist < bestEdge.d)) bestEdge = { p: c.point, d: c.dist }
  }
  if (bestEdge) return { p: { x: Math.round(bestEdge.p.x), y: Math.round(bestEdge.p.y) }, kind: "edge" }
  // «по линии» (как отслеживание в AutoCAD): X или Y совпадает с узлом — стены встают в одну линию
  let ax: { v: number; d: number; n: Vec2 } | null = null
  let ay: { v: number; d: number; n: Vec2 } | null = null
  const alignTargets: Vec2[] = [...Object.values(g.nodes), ...(prev ? [prev] : [])]
  for (const n of alignTargets) {
    const dx = Math.abs(n.x - raw.x), dy = Math.abs(n.y - raw.y)
    if (dx <= tolMm && (!ax || dx < ax.d)) ax = { v: n.x, d: dx, n }
    if (dy <= tolMm && (!ay || dy < ay.d)) ay = { v: n.y, d: dy, n }
  }
  if (ax || ay) {
    // координату узла берём как есть (у обведённых по скану узлов она дробная) — иначе стык «почти» в линию
    const p = { x: ax ? ax.v : Math.round(raw.x), y: ay ? ay.v : Math.round(raw.y) }
    const guides: Array<{ from: Vec2; to: Vec2 }> = []
    if (ax) guides.push({ from: { x: ax.n.x, y: ax.n.y }, to: p })
    if (ay) guides.push({ from: { x: ay.n.x, y: ay.n.y }, to: p })
    return { p, kind: "align", guides }
  }
  if (!snap) return { p: { x: Math.round(raw.x), y: Math.round(raw.y) }, kind: "free" }
  if (prev) {
    const dx = raw.x - prev.x, dy = raw.y - prev.y
    const len = Math.hypot(dx, dy)
    if (len > 1) {
      const step = Math.PI / 12
      const ang = Math.round(Math.atan2(dy, dx) / step) * step
      const L = Math.round(len / 50) * 50
      return { p: { x: Math.round(prev.x + Math.cos(ang) * L), y: Math.round(prev.y + Math.sin(ang) * L) }, kind: "angle" }
    }
  }
  return { p: { x: Math.round(raw.x / 100) * 100, y: Math.round(raw.y / 100) * 100 }, kind: "grid" }
}

export type Hit =
  | { kind: "node"; id: string }
  | { kind: "opening"; id: string }
  | { kind: "stair"; id: string }
  | { kind: "annotation"; id: string }
  | { kind: "mep-device"; id: string }
  | { kind: "wall"; id: string }
  | { kind: "room"; id: string }

/** Что под курсором. Приоритет: ручки узлов выбранной стены, проёмы, лестницы и лифты, пометки, приборы, стены, помещения. */
export function hitTest(floor: Floor, p: Vec2, tolMm: number, gripNodes: string[] = []): Hit | null {
  const g = floor.wallGraph
  for (const id of gripNodes) {
    const n = g.nodes[id]
    if (n && Math.hypot(n.x - p.x, n.y - p.y) <= tolMm * 1.5) return { kind: "node", id }
  }
  for (const o of floor.openings) {
    const e = g.edges[o.wallId]
    const a = e && g.nodes[e.a], b = e && g.nodes[e.b]
    if (!e || !a || !b) continue
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const c = closestOnSegment(p, a, b)
    const along = c.t * L
    if (c.dist <= e.thickness / 2 + tolMm && Math.abs(along - o.offset) <= o.width / 2) return { kind: "opening", id: o.id }
  }
  for (const st of floor.stairs) {
    if (pointInPolygon(p, stairHoleWorld(st, floor.height))) return { kind: "stair", id: st.id }
  }
  for (const an of floor.annotations ?? []) {
    if (an.kind === "dim") {
      const gm = dimGeometry(an.a, an.b, an.offset)
      if (closestOnSegment(p, gm.p1, gm.p2).dist <= tolMm) return { kind: "annotation", id: an.id }
    } else if (Math.hypot(an.at.x - p.x, an.at.y - p.y) <= tolMm * 3) return { kind: "annotation", id: an.id }
  }
  for (const d of floor.mepDevices ?? []) {
    if (Math.hypot(d.at.x - p.x, d.at.y - p.y) <= tolMm * 1.5 + 150) return { kind: "mep-device", id: d.id }
  }
  let bestWall: { id: string; d: number } | null = null
  for (const id in g.edges) {
    const e = g.edges[id]
    const a = g.nodes[e.a], b = g.nodes[e.b]
    if (!a || !b) continue
    const d = closestOnSegment(p, a, b).dist
    if (d <= e.thickness / 2 + tolMm && (!bestWall || d < bestWall.d)) bestWall = { id, d }
  }
  if (bestWall) return { kind: "wall", id: bestWall.id }
  for (const r of detectRooms(g)) {
    if (pointInPolygon(p, r.polygon) && !(r.holes ?? []).some((h) => pointInPolygon(p, h))) return { kind: "room", id: r.id }
  }
  return null
}

/** Смещение стены перпендикулярно самой себе — как при перетаскивании в 3D. */
export function perpendicularDelta(a: Vec2, b: Vec2, from: Vec2, to: Vec2, step: number): { dx: number; dy: number } {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L }
  let d = (to.x - from.x) * n.x + (to.y - from.y) * n.y
  if (step > 0) d = Math.round(d / step) * step
  return { dx: Math.round(n.x * d) + 0, dy: Math.round(n.y * d) + 0 }
}

function segIntersects(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const cross = (p: Vec2, q: Vec2, r: Vec2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d)
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))
}

/**
 * Рамка как в AutoCAD: слева направо (window) — стены целиком внутри,
 * справа налево (crossing) — все задетые.
 */
export function wallsInRect(floor: Pick<Floor, "wallGraph">, r: { minX: number; minY: number; maxX: number; maxY: number }, crossing: boolean): string[] {
  const g = floor.wallGraph
  const inside = (p: Vec2) => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY
  const corners = [{ x: r.minX, y: r.minY }, { x: r.maxX, y: r.minY }, { x: r.maxX, y: r.maxY }, { x: r.minX, y: r.maxY }]
  const out: string[] = []
  for (const id in g.edges) {
    const e = g.edges[id]
    const a = g.nodes[e.a], b = g.nodes[e.b]
    if (!a || !b) continue
    const ia = inside(a), ib = inside(b)
    if (ia && ib) { out.push(id); continue }
    if (!crossing) continue
    if (ia || ib || corners.some((c, i) => segIntersects(a, b, c, corners[(i + 1) % 4]))) out.push(id)
  }
  return out
}

/** Ширина помещения по горизонтали через точку (мм): отрезок сечения, в котором лежит точка. */
export function spanAt(poly: Vec2[], p: Vec2, holes: Vec2[][] = []): number {
  const xs: number[] = []
  for (const ring of [poly, ...holes]) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length]
      if ((a.y > p.y) === (b.y > p.y)) continue
      xs.push(a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x))
    }
  }
  xs.sort((m, n) => m - n)
  for (let i = 0; i + 1 < xs.length; i += 2) if (p.x >= xs[i] && p.x <= xs[i + 1]) return xs[i + 1] - xs[i]
  return 0
}
