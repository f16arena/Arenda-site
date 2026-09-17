// Геометрия размера: выносные линии, размерная линия, засечки и место текста.
// Один расчёт для 3D-плана, листа чертежа и DXF.

import type { Vec2 } from "@/core/geometry/math"

export interface DimGeometry {
  /** концы размерной линии */
  p1: Vec2
  p2: Vec2
  /** выносные линии: от точки измерения чуть за размерную линию */
  ext: Array<[Vec2, Vec2]>
  mid: Vec2
  lengthMm: number
  /** угол текста, градусы: читается слева направо или снизу вверх */
  angleDeg: number
  /** нормаль (влево от a→b) */
  n: Vec2
}

export function dimGeometry(a: Vec2, b: Vec2, offset: number, overshoot = 150): DimGeometry {
  const L = Math.hypot(b.x - a.x, b.y - a.y)
  const u = L > 0 ? { x: (b.x - a.x) / L, y: (b.y - a.y) / L } : { x: 1, y: 0 }
  const n = { x: -u.y, y: u.x }
  const p1 = { x: a.x + n.x * offset, y: a.y + n.y * offset }
  const p2 = { x: b.x + n.x * offset, y: b.y + n.y * offset }
  const s = Math.sign(offset) || 1
  const ext: Array<[Vec2, Vec2]> = [
    [a, { x: p1.x + n.x * overshoot * s, y: p1.y + n.y * overshoot * s }],
    [b, { x: p2.x + n.x * overshoot * s, y: p2.y + n.y * overshoot * s }],
  ]
  let angle = (Math.atan2(u.y, u.x) * 180) / Math.PI
  if (angle > 90) angle -= 180
  if (angle <= -90) angle += 180
  return { p1, p2, ext, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }, lengthMm: L, angleDeg: angle, n }
}

/** Знаковый вынос: расстояние от прямой a→b до точки, плюс — слева. */
export function signedOffset(a: Vec2, b: Vec2, p: Vec2): number {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
  return ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / L
}
