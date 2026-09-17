// План кровли: контур по наружным стенам верхнего этажа, парапет, уклоны к
// воронкам и сами воронки. Считается из модели — отдельных данных не нужно.

import type { Floor } from "@/types/builder"
import type { Vec2 } from "@/core/geometry/math"
import { buildingOutline } from "./indicators"

export interface RoofPlan {
  /** контур кровли по наружной грани стен */
  outline: Vec2[]
  /** внутренняя линия парапета */
  parapet: Vec2[]
  /** водоприёмные воронки */
  drains: Vec2[]
  /** стрелки уклона: от конька к воронке */
  slopes: Array<{ from: Vec2; to: Vec2 }>
  /** конёк скатной кровли */
  ridge: { a: Vec2; b: Vec2 } | null
  /** уклон, % */
  slopePercent: number
  /** плоская кровля или скатная */
  flat: boolean
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

const PARAPET_T = 250
const SLOPE = 1.5

function expand(poly: Vec2[], d: number): Vec2[] {
  if (poly.length < 3) return poly
  let a2 = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length]
    a2 += p.x * q.y - q.x * p.y
  }
  const sign = a2 > 0 ? 1 : -1
  return poly.map((p, i) => {
    const prev = poly[(i - 1 + poly.length) % poly.length]
    const next = poly[(i + 1) % poly.length]
    const n1 = norm(prev, p, sign)
    const n2 = norm(p, next, sign)
    // смещение по биссектрисе: p + (n1+n2)·d/(1+n1·n2) — грань отходит ровно на d
    const dot = n1.x * n2.x + n1.y * n2.y
    const k = d / Math.max(0.2, 1 + dot)
    return { x: p.x + (n1.x + n2.x) * k, y: p.y + (n1.y + n2.y) * k }
  })
}

function norm(a: Vec2, b: Vec2, sign: number): Vec2 {
  const dx = b.x - a.x, dy = b.y - a.y
  const L = Math.hypot(dx, dy) || 1
  return { x: (-dy / L) * sign, y: (dx / L) * sign }
}

/** Верхний этаж здания и его кровля. */
export function buildRoofPlan(top: Floor): RoofPlan | null {
  const centers = buildingOutline(top.wallGraph)
  if (centers.length < 3) return null
  const halfT = Object.values(top.wallGraph.edges).filter((e) => e.kind === "exterior").reduce((s, e) => s + e.thickness, 0)
    / Math.max(1, Object.values(top.wallGraph.edges).filter((e) => e.kind === "exterior").length) / 2
  const outline = expand(centers, halfT)
  const parapet = expand(centers, halfT - PARAPET_T)

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of outline) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  // воронки: по одной на каждую четверть кровли, не ближе 1,5 м к парапету
  const ix = [minX + (maxX - minX) * 0.25, minX + (maxX - minX) * 0.75]
  const iy = [minY + (maxY - minY) * 0.25, minY + (maxY - minY) * 0.75]
  const drains: Vec2[] = []
  for (const x of ix) for (const y of iy) drains.push({ x: Math.round(x), y: Math.round(y) })

  const flat = (top.roof?.type ?? "flat") === "flat"
  const mid = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  // плоская: уклон от середины к воронкам; скатная: от конька к свесам
  const horizontal = maxX - minX >= maxY - minY
  const slopes = flat
    ? drains.map((d) => ({ from: mid, to: d }))
    : horizontal
      ? [{ from: mid, to: { x: mid.x, y: minY } }, { from: mid, to: { x: mid.x, y: maxY } }]
      : [{ from: mid, to: { x: minX, y: mid.y } }, { from: mid, to: { x: maxX, y: mid.y } }]
  const ridge = flat
    ? null
    : horizontal
      ? { a: { x: minX, y: mid.y }, b: { x: maxX, y: mid.y } }
      : { a: { x: mid.x, y: minY }, b: { x: mid.x, y: maxY } }

  return {
    outline,
    parapet,
    drains: flat ? drains : [],
    ridge,
    slopes,
    // у плоской — уклон к воронкам, у скатной — из уклона ската
    slopePercent: flat ? SLOPE : Math.round(Math.tan(((top.roof?.pitchDeg ?? 20) * Math.PI) / 180) * 100),
    flat,
    bounds: { minX, minY, maxX, maxY },
  }
}
