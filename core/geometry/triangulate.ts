// ADR: Триангуляция полигонов (earcut) для полов/перекрытий/плоских крыш. Возвращает
// плоский список вершин и индексы треугольников. Поддержка дырок (вырезы под лестницы).

import earcut from "earcut"
import type { Vec2 } from "./math"

export interface Triangulation {
  vertices: Vec2[]
  indices: number[]
}

export function triangulate(outer: Vec2[], holes: Vec2[][] = []): Triangulation {
  const coords: number[] = []
  const vertices: Vec2[] = []
  for (const p of outer) {
    coords.push(p.x, p.y)
    vertices.push(p)
  }
  const holeIndices: number[] = []
  for (const h of holes) {
    holeIndices.push(vertices.length)
    for (const p of h) {
      coords.push(p.x, p.y)
      vertices.push(p)
    }
  }
  const indices = earcut(coords, holeIndices.length ? holeIndices : undefined, 2)
  return { vertices, indices }
}
