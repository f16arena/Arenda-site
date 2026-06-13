// ADR: Параметрический генератор крыш. flat (плита со свесом), gable (двускатная),
// hip (вальмовая) и fourslope (шатровая) — все по габаритам bbox контура со свесом.
// Истинный straight-skeleton для произвольных контуров — отдельная фаза. Координаты —
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

// ADR: Вальмовая крыша по габаритам bbox(expandPolygon). Конёк — вдоль длинной
// оси, по центру, укорочен на halfShort с каждого торца (вальмы — равноскатные).
// Две трапеции по длинным сторонам + два треугольных вальмовых ската по торцам;
// геометрия замкнута (без дыр). Истинный straight-skeleton — отдельная фаза.
function hipRoof(footprint: Vec2[], yEave: number, params: RoofParams): RoofMesh {
  const { minX, minY, maxX, maxY } = bbox(expandPolygon(footprint, params.overhang))
  const w = maxX - minX
  const d = maxY - minY
  const alongX = w >= d
  const halfShort = (alongX ? d : w) / 2
  const rise = Math.tan((params.pitchDeg * Math.PI) / 180) * halfShort
  const yRidge = yEave + rise
  const positions: number[] = []
  const indices: number[] = []
  const tri = (p: number[][]): void => {
    const s = positions.length / 3
    for (const v of p) positions.push(v[0], v[1], v[2])
    indices.push(s, s + 1, s + 2)
  }
  const quad = (p: number[][]): void => {
    const s = positions.length / 3
    for (const v of p) positions.push(v[0], v[1], v[2])
    indices.push(s, s + 1, s + 2, s, s + 2, s + 3)
  }
  if (alongX) {
    const midZ = (minY + maxY) / 2
    // конёк укорочен на halfShort с каждого торца
    const r0X = minX + halfShort
    const r1X = maxX - halfShort
    // трапеции по длинным сторонам (front: minY, back: maxY)
    quad([
      [minX, yEave, minY],
      [maxX, yEave, minY],
      [r1X, yRidge, midZ],
      [r0X, yRidge, midZ],
    ])
    quad([
      [maxX, yEave, maxY],
      [minX, yEave, maxY],
      [r0X, yRidge, midZ],
      [r1X, yRidge, midZ],
    ])
    // вальмовые скаты по торцам (треугольники)
    tri([
      [minX, yEave, maxY],
      [minX, yEave, minY],
      [r0X, yRidge, midZ],
    ])
    tri([
      [maxX, yEave, minY],
      [maxX, yEave, maxY],
      [r1X, yRidge, midZ],
    ])
  } else {
    const midX = (minX + maxX) / 2
    const r0Y = minY + halfShort
    const r1Y = maxY - halfShort
    quad([
      [minX, yEave, maxY],
      [minX, yEave, minY],
      [midX, yRidge, r0Y],
      [midX, yRidge, r1Y],
    ])
    quad([
      [maxX, yEave, minY],
      [maxX, yEave, maxY],
      [midX, yRidge, r1Y],
      [midX, yRidge, r0Y],
    ])
    tri([
      [minX, yEave, minY],
      [maxX, yEave, minY],
      [midX, yRidge, r0Y],
    ])
    tri([
      [maxX, yEave, maxY],
      [minX, yEave, maxY],
      [midX, yRidge, r1Y],
    ])
  }
  return { positions, indices }
}

// ADR: Шатровая (четырёхскатная) крыша — 4 треугольных ската сходятся в апексе
// по центру bbox(expandPolygon) на высоте yEave + tan(pitch)*min(halfW, halfH).
// Каркасная форма по габаритам; истинный skeleton для невыпуклых — отдельная фаза.
function fourslopeRoof(footprint: Vec2[], yEave: number, params: RoofParams): RoofMesh {
  const { minX, minY, maxX, maxY } = bbox(expandPolygon(footprint, params.overhang))
  const halfW = (maxX - minX) / 2
  const halfH = (maxY - minY) / 2
  const rise = Math.tan((params.pitchDeg * Math.PI) / 180) * Math.min(halfW, halfH)
  const yApex = yEave + rise
  const cx = (minX + maxX) / 2
  const cz = (minY + maxY) / 2
  const positions: number[] = []
  const indices: number[] = []
  const tri = (p: number[][]): void => {
    const s = positions.length / 3
    for (const v of p) positions.push(v[0], v[1], v[2])
    indices.push(s, s + 1, s + 2)
  }
  const apex: number[] = [cx, yApex, cz]
  // 4 угла карниза по часовой: front, right, back, left
  tri([[minX, yEave, minY], [maxX, yEave, minY], apex]) // южный скат
  tri([[maxX, yEave, minY], [maxX, yEave, maxY], apex]) // восточный
  tri([[maxX, yEave, maxY], [minX, yEave, maxY], apex]) // северный
  tri([[minX, yEave, maxY], [minX, yEave, minY], apex]) // западный
  return { positions, indices }
}

/**
 * Сгенерировать кровлю над контуром этажа. yBase — отметка верха стен (мм, по Y вверх).
 * flat, gable, hip и fourslope строятся по габаритам контура (со свесом).
 */
export function generateRoof(footprint: Vec2[], yBase: number, params: RoofParams): RoofMesh {
  if (footprint.length < 3) return { positions: [], indices: [] }
  switch (params.type) {
    case "flat":
      return flatRoof(footprint, yBase + params.thickness, params)
    case "gable":
      return gableRoof(footprint, yBase, params)
    case "hip":
      return hipRoof(footprint, yBase, params)
    case "fourslope":
      return fourslopeRoof(footprint, yBase, params)
    default:
      return gableRoof(footprint, yBase, params)
  }
}
