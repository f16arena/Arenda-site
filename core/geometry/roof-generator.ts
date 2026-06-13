// ADR: Параметрический генератор крыш. flat (плита со свесом), gable (двускатная),
// hip (вальмовая) и fourslope (шатровая) — все по габаритам bbox контура со свесом.
// Истинный straight-skeleton для произвольных контуров — отдельная фаза. Координаты —
// [x, yUp, z] в мм (план x→X, y→Z, высота→Y), рендер делит на 1000.

import { type Vec2, centroid, normalize, scale, sub, add } from "./math"
import { triangulate } from "./triangulate"

export type RoofType = "flat" | "gable" | "hip" | "fourslope" | "mansard" | "shed"

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

// ADR: Односкатная (shed) крыша — одна наклонная плоскость по bbox(expandPolygon)
// от низкой стороны (yEave) к высокой (yEave + tan(pitch)*depth) вдоль короткой оси.
// Боковые фронтоны (треугольники) и торцы (вертикальные quad'ы) замыкают объём без дыр.
function shedRoof(footprint: Vec2[], yEave: number, params: RoofParams): RoofMesh {
  const { minX, minY, maxX, maxY } = bbox(expandPolygon(footprint, params.overhang))
  const w = maxX - minX
  const d = maxY - minY
  // скат идёт вдоль более короткой оси (depth = пролёт ската)
  const slopeAlongZ = d <= w
  const depth = slopeAlongZ ? d : w
  const yHigh = yEave + Math.tan((params.pitchDeg * Math.PI) / 180) * depth
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
  if (slopeAlongZ) {
    // низкая кромка на minY (yEave), высокая на maxY (yHigh)
    // наклонная плоскость
    quad([
      [minX, yEave, minY],
      [maxX, yEave, minY],
      [maxX, yHigh, maxY],
      [minX, yHigh, maxY],
    ])
    // торцевые фронтоны (вертикальные треугольники по minX и maxX)
    tri([[minX, yEave, minY], [minX, yHigh, maxY], [minX, yEave, maxY]])
    tri([[maxX, yEave, maxY], [maxX, yHigh, maxY], [maxX, yEave, minY]])
    // высокий торец (вертикальная стенка под высокой кромкой)
    quad([
      [minX, yEave, maxY],
      [minX, yHigh, maxY],
      [maxX, yHigh, maxY],
      [maxX, yEave, maxY],
    ])
  } else {
    // низкая кромка на minX (yEave), высокая на maxX (yHigh)
    quad([
      [minX, yEave, maxY],
      [minX, yEave, minY],
      [maxX, yHigh, minY],
      [maxX, yHigh, maxY],
    ])
    tri([[minX, yEave, minY], [maxX, yHigh, minY], [maxX, yEave, minY]])
    tri([[maxX, yEave, maxY], [maxX, yHigh, maxY], [minX, yEave, maxY]])
    quad([
      [maxX, yEave, minY],
      [maxX, yHigh, minY],
      [maxX, yHigh, maxY],
      [maxX, yEave, maxY],
    ])
  }
  return { positions, indices }
}

// ADR: Мансардная (mansard) крыша по bbox(expandPolygon): нижний крутой пояс (~70°,
// высота min(halfW,halfH)*0.6) из 4 трапеций, смещённых внутрь до «полки», затем
// верхний пологий скат (pitchDeg) как вальма к укороченному коньку. Замкнуто, непусто.
function mansardRoof(footprint: Vec2[], yEave: number, params: RoofParams): RoofMesh {
  const { minX, minY, maxX, maxY } = bbox(expandPolygon(footprint, params.overhang))
  const halfW = (maxX - minX) / 2
  const halfH = (maxY - minY) / 2
  const minHalf = Math.min(halfW, halfH)
  // нижний крутой пояс: высота и горизонтальный отступ внутрь под углом ~70°
  const lowerH = minHalf * 0.6
  const inset = Math.min(lowerH / Math.tan((70 * Math.PI) / 180), minHalf * 0.5)
  const yShelf = yEave + lowerH
  // координаты «полки» (внутренний прямоугольник)
  const ix0 = minX + inset
  const ix1 = maxX - inset
  const iz0 = minY + inset
  const iz1 = maxY - inset
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
  // нижний пояс: 4 трапеции (карниз → полка)
  quad([[minX, yEave, minY], [maxX, yEave, minY], [ix1, yShelf, iz0], [ix0, yShelf, iz0]]) // front (minY)
  quad([[maxX, yEave, maxY], [minX, yEave, maxY], [ix0, yShelf, iz1], [ix1, yShelf, iz1]]) // back (maxY)
  quad([[minX, yEave, maxY], [minX, yEave, minY], [ix0, yShelf, iz0], [ix0, yShelf, iz1]]) // left (minX)
  quad([[maxX, yEave, minY], [maxX, yEave, maxY], [ix1, yShelf, iz1], [ix1, yShelf, iz0]]) // right (maxX)
  // верхний пологий скат: вальма от полки к укороченному коньку вдоль длинной оси
  const innerW = ix1 - ix0
  const innerD = iz1 - iz0
  const alongX = innerW >= innerD
  const upperHalf = (alongX ? innerD : innerW) / 2
  const upperRise = Math.tan((params.pitchDeg * Math.PI) / 180) * upperHalf
  const yRidge = yShelf + upperRise
  if (alongX) {
    const midZ = (iz0 + iz1) / 2
    const r0X = ix0 + upperHalf
    const r1X = ix1 - upperHalf
    quad([[ix0, yShelf, iz0], [ix1, yShelf, iz0], [r1X, yRidge, midZ], [r0X, yRidge, midZ]])
    quad([[ix1, yShelf, iz1], [ix0, yShelf, iz1], [r0X, yRidge, midZ], [r1X, yRidge, midZ]])
    tri([[ix0, yShelf, iz1], [ix0, yShelf, iz0], [r0X, yRidge, midZ]])
    tri([[ix1, yShelf, iz0], [ix1, yShelf, iz1], [r1X, yRidge, midZ]])
  } else {
    const midX = (ix0 + ix1) / 2
    const r0Z = iz0 + upperHalf
    const r1Z = iz1 - upperHalf
    quad([[ix0, yShelf, iz1], [ix0, yShelf, iz0], [midX, yRidge, r0Z], [midX, yRidge, r1Z]])
    quad([[ix1, yShelf, iz0], [ix1, yShelf, iz1], [midX, yRidge, r1Z], [midX, yRidge, r0Z]])
    tri([[ix0, yShelf, iz0], [ix1, yShelf, iz0], [midX, yRidge, r0Z]])
    tri([[ix1, yShelf, iz1], [ix0, yShelf, iz1], [midX, yRidge, r1Z]])
  }
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
    case "mansard":
      return mansardRoof(footprint, yBase, params)
    case "shed":
      return shedRoof(footprint, yBase, params)
    default:
      return gableRoof(footprint, yBase, params)
  }
}
