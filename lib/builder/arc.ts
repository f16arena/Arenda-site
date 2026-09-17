// Дуговая стена: окружность через три точки (начало, конец, точка на дуге) и
// её разбиение на короткие прямые участки. Граф стен остаётся прямолинейным —
// поэтому к дуге сразу работают комнаты, проёмы, размеры и чертёж.

import type { Vec2 } from "@/core/geometry/math"

/** Центр окружности через три точки; null — точки на одной прямой. */
export function circumcenter(a: Vec2, b: Vec2, c: Vec2): Vec2 | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) < 1e-6) return null
  const a2 = a.x * a.x + a.y * a.y
  const b2 = b.x * b.x + b.y * b.y
  const c2 = c.x * c.x + c.y * c.y
  return {
    x: (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d,
    y: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  }
}

/**
 * Точки дуги от `a` до `b`, проходящей через `through`, включая концы.
 * Участок ~ `segment` мм (не меньше 4 и не больше 48 участков).
 * Если точки на одной прямой (или дуга почти прямая) — просто [a, b].
 */
export function arcPoints(a: Vec2, b: Vec2, through: Vec2, segment = 600): Vec2[] {
  const c = circumcenter(a, b, through)
  if (!c) return [a, b]
  const r = Math.hypot(a.x - c.x, a.y - c.y)
  // слишком плоская дуга (стрела прогиба < 20 мм) — это прямая стена
  const chordMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const cross = (b.x - a.x) * (through.y - a.y) - (b.y - a.y) * (through.x - a.x)
  const sag = Math.abs(cross) / Math.hypot(b.x - a.x, b.y - a.y)
  if (sag < 20 || !Number.isFinite(r) || Math.hypot(chordMid.x - c.x, chordMid.y - c.y) > 1e7) return [a, b]

  const ang = (p: Vec2) => Math.atan2(p.y - c.y, p.x - c.x)
  const TAU = Math.PI * 2
  const norm = (x: number) => ((x % TAU) + TAU) % TAU
  const a0 = ang(a)
  const sweepCcw = norm(ang(b) - a0) // против часовой от a до b
  const throughCcw = norm(ang(through) - a0)
  // through лежит на дуге против часовой — идём так, иначе по часовой
  const sweep = throughCcw <= sweepCcw ? sweepCcw : -(TAU - sweepCcw)
  const length = Math.abs(sweep) * r
  const n = Math.max(4, Math.min(48, Math.round(length / segment)))
  const out: Vec2[] = [a]
  for (let i = 1; i < n; i++) {
    const t = a0 + (sweep * i) / n
    out.push({ x: Math.round(c.x + r * Math.cos(t)), y: Math.round(c.y + r * Math.sin(t)) })
  }
  out.push(b)
  return out
}
