// ADR: Чистая 2D/3D-математика геометрического ядра. Без Babylon и React —
// работает и в main thread, и в Web Worker. Единицы документа — миллиметры;
// рендер делит на 1000 (1 unit = 1 m). Все функции — чистые и тестируемые.

export interface Vec2 {
  x: number
  y: number
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

export const EPS = 1e-6

export const v2 = (x: number, y: number): Vec2 => ({ x, y })

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s })
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x
export const length = (a: Vec2): number => Math.hypot(a.x, a.y)
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

export function normalize(a: Vec2): Vec2 {
  const l = length(a)
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }
}

/** Левый перпендикуляр единичного направления (для offset стен по толщине). */
export function perpLeft(dir: Vec2): Vec2 {
  return { x: -dir.y, y: dir.x }
}

/** Угол направления в радианах [-PI, PI]. */
export function angleOf(dir: Vec2): number {
  return Math.atan2(dir.y, dir.x)
}

/** Кратчайшая разница углов a-b в диапазоне (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = a - b
  while (d <= -Math.PI) d += Math.PI * 2
  while (d > Math.PI) d -= Math.PI * 2
  return d
}

/** Расстояние от точки p до отрезка ab + ближайшая точка и параметр t∈[0,1]. */
export function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number; dist: number } {
  const ab = sub(b, a)
  const len2 = dot(ab, ab)
  const t = len2 < EPS ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2))
  const point = { x: a.x + ab.x * t, y: a.y + ab.y * t }
  return { point, t, dist: distance(p, point) }
}

/**
 * Пересечение отрезков ab и cd. Возвращает точку и параметры, если отрезки
 * пересекаются строго внутри (не на общих концах). Параллельные → null.
 */
export function segmentIntersection(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  d: Vec2,
): { point: Vec2; t: number; u: number } | null {
  const r = sub(b, a)
  const s = sub(d, c)
  const denom = cross(r, s)
  if (Math.abs(denom) < EPS) return null // параллельны/коллинеарны
  const ac = sub(c, a)
  const t = cross(ac, s) / denom
  const u = cross(ac, r) / denom
  if (t <= EPS || t >= 1 - EPS || u <= EPS || u >= 1 - EPS) return null
  return { point: { x: a.x + r.x * t, y: a.y + r.y * t }, t, u }
}

/** Пересечение двух прямых (через точку+направление). null если параллельны. */
export function lineIntersection(p1: Vec2, d1: Vec2, p2: Vec2, d2: Vec2): Vec2 | null {
  const denom = cross(d1, d2)
  if (Math.abs(denom) < EPS) return null
  const diff = sub(p2, p1)
  const t = cross(diff, d2) / denom
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t }
}

/** Площадь полигона со знаком (shoelace). >0 — против часовой (CCW). */
export function signedArea(poly: Vec2[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

export const polygonArea = (poly: Vec2[]): number => Math.abs(signedArea(poly))
export const isCCW = (poly: Vec2[]): boolean => signedArea(poly) > 0

export function centroid(poly: Vec2[]): Vec2 {
  let cx = 0
  let cy = 0
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const f = p.x * q.y - q.x * p.y
    cx += (p.x + q.x) * f
    cy += (p.y + q.y) * f
    a += f
  }
  if (Math.abs(a) < EPS) {
    // вырожденный полигон — среднее вершин
    const m = poly.reduce((acc, p) => add(acc, p), v2(0, 0))
    return scale(m, 1 / Math.max(1, poly.length))
  }
  a *= 3
  return { x: cx / a, y: cy / a }
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    const intersect = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    if (intersect) inside = !inside
  }
  return inside
}

/** Округление к шагу сетки (мм). */
export const snapToGrid = (value: number, grid: number): number =>
  grid <= 0 ? value : Math.round(value / grid) * grid

/** Снап угла направления к ближайшему шагу (рад). Возвращает новое направление. */
export function snapDirection(dir: Vec2, stepRad: number): Vec2 {
  if (stepRad <= 0) return dir
  const len = length(dir)
  const ang = Math.round(angleOf(dir) / stepRad) * stepRad
  return { x: Math.cos(ang) * len, y: Math.sin(ang) * len }
}
