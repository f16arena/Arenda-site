// Привязки для сетей: к приборам и вершинам трасс, угол 45°, крепление к стене.

import type { Vec2 } from "@/core/geometry/math"
import type { WallGraph } from "@/core/geometry/wall-graph"

export interface MepSnapResult {
  at: Vec2
  /** к чему привязались — для подсказки */
  kind: "target" | "angle" | "grid" | "free"
}

/**
 * Точка трассы. Порядок: ближайший прибор/вершина в допуске → угол кратный 45°
 * от предыдущей точки с длиной, округлённой до шага → сетка.
 */
export function snapMepPoint(
  raw: Vec2,
  prev: Vec2 | null,
  opts: { targets: Vec2[]; tolMm: number; snap: boolean; step?: number },
): MepSnapResult {
  let best: { p: Vec2; d: number } | null = null
  for (const t of opts.targets) {
    const d = Math.hypot(t.x - raw.x, t.y - raw.y)
    if (d <= opts.tolMm && (!best || d < best.d)) best = { p: t, d }
  }
  if (best) return { at: { x: Math.round(best.p.x), y: Math.round(best.p.y) }, kind: "target" }
  if (!opts.snap) return { at: { x: Math.round(raw.x), y: Math.round(raw.y) }, kind: "free" }
  const step = opts.step ?? 50
  if (prev) {
    const dx = raw.x - prev.x, dy = raw.y - prev.y
    const len = Math.hypot(dx, dy)
    if (len > 1) {
      const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
      const L = Math.max(step, Math.round(len / step) * step)
      return { at: { x: Math.round(prev.x + Math.cos(ang) * L), y: Math.round(prev.y + Math.sin(ang) * L) }, kind: "angle" }
    }
  }
  return { at: { x: Math.round(raw.x / step) * step, y: Math.round(raw.y / step) * step }, kind: "grid" }
}

/**
 * Прибор на стену: ближайшая стена в пределах maxDist, точка на её грани со
 * стороны курсора, отступ на половину глубины прибора. rotation — угол стены, °.
 */
export function wallMount(p: Vec2, g: WallGraph, depth: number, maxDist = 800): { at: Vec2; rotation: number } | null {
  let best: { d: number; at: Vec2; rotation: number } | null = null
  for (const id in g.edges) {
    const e = g.edges[id]
    const a = g.nodes[e.a], b = g.nodes[e.b]
    if (!a || !b) continue
    const dx = b.x - a.x, dy = b.y - a.y
    const L2 = dx * dx + dy * dy
    if (L2 < 1) continue
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2))
    const q = { x: a.x + dx * t, y: a.y + dy * t }
    const d = Math.hypot(p.x - q.x, p.y - q.y)
    if (d > maxDist + e.thickness / 2 || (best && d >= best.d)) continue
    const L = Math.sqrt(L2)
    let nx = -dy / L, ny = dx / L
    if ((p.x - q.x) * nx + (p.y - q.y) * ny < 0) { nx = -nx; ny = -ny }
    const off = e.thickness / 2 + depth / 2
    // угол стены, развёрнутый так, чтобы «лицо» прибора (+нормаль) смотрело в комнату
    const rotation = (Math.atan2(-nx, ny) * 180) / Math.PI
    best = { d, at: { x: Math.round(q.x + nx * off), y: Math.round(q.y + ny * off) }, rotation: Math.round(rotation) }
  }
  return best ? { at: best.at, rotation: best.rotation } : null
}
