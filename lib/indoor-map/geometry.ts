// Геометрия indoor-карты: полигоны помещений, точка подписи, габариты этажа.
// Чистые функции без React и без DOM — их же будет есть объёмный режим (SPEC §2).

import type { FloorElement, FloorLayoutV2, Point, PolygonRoom, RectRoom } from "@/lib/floor-layout"

export type Box = { minX: number; minY: number; maxX: number; maxY: number }

export type RoomElement = RectRoom | PolygonRoom

export function isRoom(el: FloorElement): el is RoomElement {
  return el.type === "rect" || el.type === "polygon"
}

/** Контур помещения в метрах. Прямоугольник разворачивается в 4 точки. */
export function roomPolygon(el: RoomElement): Point[] {
  if (el.type === "polygon") return el.points
  return [
    { x: el.x, y: el.y },
    { x: el.x + el.width, y: el.y },
    { x: el.x + el.width, y: el.y + el.height },
    { x: el.x, y: el.y + el.height },
  ]
}

export function polygonBox(points: Point[]): Box {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

/** Габариты всего, что нарисовано на этаже. Пустой план отдаёт холст целиком. */
export function layoutBox(layout: FloorLayoutV2): Box {
  const rooms = layout.elements.filter(isRoom)
  if (rooms.length === 0) return { minX: 0, minY: 0, maxX: layout.width, maxY: layout.height }
  const boxes = rooms.map((r) => polygonBox(roomPolygon(r)))
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  }
}

/** Площадь полигона (Гаусс). Знак отброшен — направление обхода не важно. */
export function area(points: Point[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    sum += points[i].x * points[j].y - points[j].x * points[i].y
  }
  return Math.abs(sum) / 2
}

export function pointInPolygon(p: Point, points: Point[]): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]
    const b = points[j]
    const crosses = a.y > p.y !== b.y > p.y
    if (crosses && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Центр тяжести полигона — не центр bounding box (SPEC §3, правила подписей). */
export function centroid(points: Point[]): Point {
  let a2 = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    const cross = points[i].x * points[j].y - points[j].x * points[i].y
    a2 += cross
    cx += (points[i].x + points[j].x) * cross
    cy += (points[i].y + points[j].y) * cross
  }
  if (Math.abs(a2) < 1e-9) {
    const b = polygonBox(points)
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
  }
  const a = a2 / 2
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

function distanceToEdges(p: Point, points: Point[]): number {
  let min = Infinity
  for (let i = 0; i < points.length; i++) {
    const d = distanceToSegment(p, points[i], points[(i + 1) % points.length])
    if (d < min) min = d
  }
  return min
}

/**
 * Якорь подписи: центр тяжести, а для вогнутых помещений (буква Г, П) — самая
 * «просторная» внутренняя точка. Иначе подпись угловой секции уезжает в коридор.
 */
export function labelAnchor(points: Point[]): Point {
  const c = centroid(points)
  if (pointInPolygon(c, points)) return c

  const b = polygonBox(points)
  const steps = 16
  let best = c
  let bestDistance = -1
  for (let i = 1; i < steps; i++) {
    for (let j = 1; j < steps; j++) {
      const p = {
        x: b.minX + ((b.maxX - b.minX) * i) / steps,
        y: b.minY + ((b.maxY - b.minY) * j) / steps,
      }
      if (!pointInPolygon(p, points)) continue
      const d = distanceToEdges(p, points)
      if (d > bestDistance) {
        bestDistance = d
        best = p
      }
    }
  }
  return best
}

/**
 * Сколько метров свободно по горизонтали на высоте якоря — столько места есть
 * у подписи. Считается по пересечению горизонтали с рёбрами полигона.
 */
export function widthAt(points: Point[], anchor: Point): number {
  const xs: number[] = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    if (a.y === b.y) continue
    const lo = Math.min(a.y, b.y)
    const hi = Math.max(a.y, b.y)
    if (anchor.y < lo || anchor.y > hi) continue
    xs.push(a.x + ((anchor.y - a.y) * (b.x - a.x)) / (b.y - a.y))
  }
  if (xs.length < 2) {
    const b = polygonBox(points)
    return b.maxX - b.minX
  }
  xs.sort((p, q) => p - q)
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (anchor.x >= xs[i] - 1e-6 && anchor.x <= xs[i + 1] + 1e-6) return xs[i + 1] - xs[i]
  }
  return xs[xs.length - 1] - xs[0]
}

export function polygonPath(points: Point[]): string {
  if (points.length === 0) return ""
  return `${points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ")} Z`
}
