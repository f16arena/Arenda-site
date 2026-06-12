// ADR: Параметрический генератор крыш. Фаза 1 — flat (плита со свесом) и gable
// (двускатная по габаритам контура). hip/fourslope — Фаза 3 (straight skeleton):
// API готов, сейчас падает в gable как безопасный фолбэк с пометкой. Координаты —
// [x, yUp, z] в мм (план x→X, y→Z, высота→Y), рендер делит на 1000.

import { type Vec2, centroid, normalize, scale, sub, add } from "./math"
import { triangulate } from "./triangulate"

export type RoofType = "flat" | "gable" | "hip" | "fourslope"

export interface RoofParams {
  type: RoofType
  pitchDeg: number // уклон ската
  overhang: number // свес, мм
  thickness: number // толщина плиты/настила, мм
  materialId?: string
}

export interface RoofMesh {
  positions: number[] // [x,yUp,z] * n, мм
  indices: number[]
}

function bbox(poly: Vec2[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of poly) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

/** Простой outward-offset через смещение вершин от центроида (для свеса плоской кровли). */
function expandPolygon(poly: Vec2[], d: number): Vec2[] {
  if (d <= 0) return poly
  const c = centroid(poly)
  return poly.map((p) => add(p, scale(normalize(sub(p, c)), d)))
}

function flatRoof(footprint: Vec2[], yTop: number, params: RoofParams): RoofMesh {
  const outer = expandPolygon(footprint, params.overhang)
  const tri = triangulate(outer)
  const positions: number[] = []
  const indices: number[] = []
  const yBot = yTop - params.thickness
  // верхняя грань
  for (const v of tri.vertices) positions.push(v.x, yTop, v.y)
  indices.push(...tri.indices)
  // нижняя грань (инвертированный порядок)
  const baseBot = tri.vertices.length
  for (const v of tri.vertices) positions.push(v.x, yBot, v.y)
  for (let i = 0; i < tri.indices.length; i += 3) {
    indices.push(baseBot + tri.indices[i], baseBot + tri.indices[i + 2], baseBot + tri.indices[i + 1])
  }
  // боковые грани по периметру outer
  const n = outer.length
  for (let i = 0; i < n; i++) {
    const a = outer[i]
    const b = outer[(i + 1) % n]
    const s = positions.length / 3
    positions.push(a.x, yTop, a.y, b.x, yTop, b.y, b.x, yBot, b.y, a.x, yBot, a.y)
    indices.push(s, s + 1, s + 2, s, s + 2, s + 3)
  }
  return { positions, indices }
}

function gableRoof(footprint: Vec2[], yEave: number, params: RoofParams): RoofMesh {
  const { minX, minY, maxX, maxY } = bbox(expandPolygon(footprint, params.overhang))
  const w = maxX - minX
  const d = maxY - minY
  const alongX = w >= d
  const half = (alongX ? d : w) / 2
  const rise = Math.tan((params.pitchDeg * Math.PI) / 180) * half
  const yRidge = yEave + rise
  const positions: number[] = []
  const indices: number[] = []
  const quad = (p: number[][]) => {
    const s = positions.length / 3
    for (const v of p) positions.push(v[0], v[1], v[2])
    indices.push(s, s + 1, s + 2, s, s + 2, s + 3)
  }
  if (alongX) {
    const midZ = (minY + maxY) / 2
    // два ската
    quad([[minX, yEave, minY], [maxX, yEave, minY], [maxX, yRidge, midZ], [minX, yRidge, midZ]])
    quad([[maxX, yEave, maxY], [minX, yEave, maxY], [minX, yRidge, midZ], [maxX, yRidge, midZ]])
    // фронтоны (треугольники)
    let s = positions.length / 3
    positions.push(minX, yEave, minY, minX, yRidge, midZ, minX, yEave, maxY)
    indices.push(s, s + 1, s + 2)
    s = positions.length / 3
    positions.push(maxX, yEave, maxY, maxX, yRidge, midZ, maxX, yEave, minY)
    indices.push(s, s + 1, s + 2)
  } else {
    const midX = (minX + maxX) / 2
    quad([[minX, yEave, minY], [minX, yEave, maxY], [midX, yRidge, maxY], [midX, yRidge, minY]])
    quad([[maxX, yEave, maxY], [maxX, yEave, minY], [midX, yRidge, minY], [midX, yRidge, maxY]])
    let s = positions.length / 3
    positions.push(minX, yEave, minY, midX, yRidge, minY, maxX, yEave, minY)
    indices.push(s, s + 1, s + 2)
    s = positions.length / 3
    positions.push(maxX, yEave, maxY, midX, yRidge, maxY, minX, yEave, maxY)
    indices.push(s, s + 1, s + 2)
  }
  return { positions, indices }
}

/**
 * Сгенерировать кровлю над контуром этажа. yBase — отметка верха стен (мм, по Y вверх).
 * Фаза 1: flat и gable. hip/fourslope — Фаза 3 (пока gable-фолбэк).
 */
export function generateRoof(footprint: Vec2[], yBase: number, params: RoofParams): RoofMesh {
  if (footprint.length < 3) return { positions: [], indices: [] }
  switch (params.type) {
    case "flat":
      return flatRoof(footprint, yBase + params.thickness, params)
    case "gable":
    case "hip":
    case "fourslope":
    default:
      return gableRoof(footprint, yBase, params)
  }
}
