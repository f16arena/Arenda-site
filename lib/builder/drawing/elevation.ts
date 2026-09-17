// Фасады и разрезы здания из модели — как листы архитектурного раздела.
//
// Чистые функции: здание → примитивы в координатах листа модели (u — по
// горизонтали листа, z — отметка, оба в мм). Фасад — ортогональная проекция
// наружных стен, проёмов, крылец и крыши с удалением невидимого «художником»
// (дальнее рисуется раньше и закрывается ближним). Разрез — то же за
// секущей плоскостью плюс рассечённые стены и перекрытия.

import type { Building, Floor } from "@/types/builder"
import { detectRooms } from "@/core/geometry/room-detection"
import { pointInPolygon, type Vec2 } from "@/core/geometry/math"
import { generateRoof } from "@/core/geometry/roof-generator"
import { generateStair, stairPlanRects, stairRise } from "@/core/geometry/stair-generator"

export type Pt = { x: number; y: number }

/** Толщина перекрытия на разрезе, мм. В модели плит нет — берём типовую. */
export const SLAB = 220

export type FillKind = "face" | "opening" | "glass" | "cut" | "slab" | "porch" | "roof"

export interface EPoly {
  pts: Pt[] // x = u, y = z
  fill: FillKind
}
export interface ELine {
  a: Pt
  b: Pt
  weight: "thin" | "main" | "thick"
  dash?: boolean
  /** служебное: боковая кромка грани стены (для удаления швов) */
  seam?: { depth: number; floor: string }
}
export interface ELevelMark {
  z: number
  text: string
}
export interface EDim {
  z0: number
  z1: number
  text: string
}

export type EItem = ({ t: "poly" } & EPoly) | ({ t: "line" } & ELine)

export interface ElevationDrawing {
  kind: "facade" | "section"
  /** в порядке рисования: дальнее раньше, ближнее закрывает */
  items: EItem[]
  marks: ELevelMark[]
  /** вертикальная цепочка высот этажей слева */
  dims: EDim[]
  /** подписи этажей справа от отметок */
  floorNames: { z: number; text: string }[]
  bounds: { minU: number; maxU: number; minZ: number; maxZ: number }
}

/** Вид: откуда смотрим. d — направление взгляда в плане (единичный вектор). */
export interface ViewFrame {
  /** точка отсчёта: для разреза — начало секущей линии */
  origin: Vec2
  d: Vec2
}

export type FacadeSide = "south" | "north" | "west" | "east"

export const FACADE_DIR: Record<FacadeSide, Vec2> = {
  // план в модели — ось Y вверх, как в CAD: «юг» внизу листа
  south: { x: 0, y: 1 },
  north: { x: 0, y: -1 },
  west: { x: 1, y: 0 },
  east: { x: -1, y: 0 },
}

/** правая рука смотрящего в направлении d */
function rightOf(d: Vec2): Vec2 {
  return { x: d.y, y: -d.x }
}

function project(f: ViewFrame, p: Vec2): { u: number; depth: number } {
  const r = rightOf(f.d)
  const dx = p.x - f.origin.x, dy = p.y - f.origin.y
  return { u: dx * r.x + dy * r.y, depth: dx * f.d.x + dy * f.d.y }
}

export function levelText(mm: number): string {
  if (Math.abs(mm) < 0.5) return "±0,000"
  const s = (Math.abs(mm) / 1000).toFixed(3).replace(".", ",")
  return `${mm > 0 ? "+" : "−"}${s}`
}

function floorLabel(f: Floor): string {
  if (f.level < 0) return "Подвал"
  if (f.level === 0) return "Цоколь"
  return `${f.level} этаж`
}

interface WallInfo {
  floor: Floor
  id: string
  a: Vec2
  b: Vec2
  thickness: number
  height: number
  kind: string
  /** наружу (для наружных стен), иначе null */
  outward: Vec2 | null
}

function wallsOf(floor: Floor): WallInfo[] {
  const rooms = detectRooms(floor.wallGraph)
  const inside = (p: Vec2) => rooms.some((r) => pointInPolygon(p, r.polygon))
  const out: WallInfo[] = []
  for (const id in floor.wallGraph.edges) {
    const e = floor.wallGraph.edges[id]
    const a = floor.wallGraph.nodes[e.a], b = floor.wallGraph.nodes[e.b]
    if (!a || !b) continue
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    if (L < 1) continue
    let outward: Vec2 | null = null
    if (e.kind === "exterior") {
      const n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L }
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const probe = e.thickness / 2 + 150
      const leftIn = inside({ x: mid.x + n.x * probe, y: mid.y + n.y * probe })
      const rightIn = inside({ x: mid.x - n.x * probe, y: mid.y - n.y * probe })
      // обе стороны снаружи (отдельная стенка) или обе внутри — считаем, что смотрит влево
      outward = leftIn && !rightIn ? { x: -n.x, y: -n.y } : n
    }
    out.push({ floor, id, a, b, thickness: e.thickness, height: e.height, kind: e.kind, outward })
  }
  return out
}

/** Прямоугольник грани стены с проёмами в проекции. */
function wallFace(f: ViewFrame, w: WallInfo): { depth: number; polys: EPoly[]; lines: ELine[]; u0: number; u1: number } | null {
  const pa = project(f, w.a), pb = project(f, w.b)
  const u0 = Math.min(pa.u, pb.u), u1 = Math.max(pa.u, pb.u)
  if (u1 - u0 < 5) return null
  const z0 = Math.max(w.floor.elevation, 0), z1 = w.floor.elevation + w.height
  const polys: EPoly[] = []
  const lines: ELine[] = []
  if (z1 > z0) {
    polys.push({ pts: rect(u0, z0, u1, z1), fill: "face" })
    // контур грани: верх и низ всегда, бока — помечены, чтобы убрать швы между
    // участками одной плоскости фасада
    const depth = (pa.depth + pb.depth) / 2
    lines.push({ a: { x: u0, y: z1 }, b: { x: u1, y: z1 }, weight: "main" })
    lines.push({ a: { x: u0, y: z0 }, b: { x: u1, y: z0 }, weight: "main" })
    lines.push({ a: { x: u0, y: z0 }, b: { x: u0, y: z1 }, weight: "main", seam: { depth, floor: w.floor.id } })
    lines.push({ a: { x: u1, y: z0 }, b: { x: u1, y: z1 }, weight: "main", seam: { depth, floor: w.floor.id } })
  }
  const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
  for (const o of w.floor.openings) {
    if (o.wallId !== w.id) continue
    const t0 = (o.offset - o.width / 2) / L, t1 = (o.offset + o.width / 2) / L // offset — центр проёма
    const ua = pa.u + (pb.u - pa.u) * t0, ub = pa.u + (pb.u - pa.u) * t1
    const ou0 = Math.min(ua, ub), ou1 = Math.max(ua, ub)
    const oz0 = w.floor.elevation + (o.type === "door" ? 0 : o.sillHeight)
    const oz1 = Math.min(z1, oz0 + o.height)
    if (oz1 <= Math.max(oz0, 0) || ou1 - ou0 < 5) continue
    const bottom = Math.max(oz0, 0)
    polys.push({ pts: rect(ou0, bottom, ou1, oz1), fill: o.type === "window" ? "glass" : "opening" })
    if (o.type === "window") {
      // переплёт: импост посередине и горизонтальная фрамуга в верхней трети
      const mu = (ou0 + ou1) / 2
      lines.push({ a: { x: mu, y: bottom }, b: { x: mu, y: oz1 }, weight: "thin" })
      const fz = oz1 - (oz1 - bottom) / 3
      lines.push({ a: { x: ou0, y: fz }, b: { x: ou1, y: fz }, weight: "thin" })
    } else if (o.width >= 1200) {
      const mu = (ou0 + ou1) / 2
      lines.push({ a: { x: mu, y: bottom }, b: { x: mu, y: oz1 }, weight: "thin" })
    }
  }
  return { depth: (pa.depth + pb.depth) / 2, polys, lines, u0, u1 }
}

function rect(u0: number, z0: number, u1: number, z1: number): Pt[] {
  return [{ x: u0, y: z0 }, { x: u1, y: z0 }, { x: u1, y: z1 }, { x: u0, y: z1 }]
}

type Layer = { depth: number; polys: EPoly[]; lines: ELine[] }

function porchLayers(f: ViewFrame, floor: Floor, minDepth: number): Layer[] {
  const out: Layer[] = []
  for (const st of floor.stairs) {
    if (st.shape !== "porch") continue
    const rise = stairRise(st, floor.height)
    const geo = generateStair(st.shape, rise, st.width, st.railing)
    const rects = stairPlanRects(st, floor.height)
    geo.steps.forEach((b, i) => {
      const pr = rects[i].map((p) => project(f, p))
      const u0 = Math.min(...pr.map((p) => p.u)), u1 = Math.max(...pr.map((p) => p.u))
      const depth = Math.min(...pr.map((p) => p.depth))
      if (depth < minDepth) return
      const z1 = floor.elevation + b.y + b.h / 2, z0 = Math.max(0, floor.elevation + b.y - b.h / 2)
      if (z1 <= z0) return
      out.push({ depth, polys: [{ pts: rect(u0, z0, u1, z1), fill: "porch" }], lines: [] })
    })
  }
  return out
}

function footprintRect(floor: Floor): Vec2[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const id in floor.wallGraph.nodes) {
    const n = floor.wallGraph.nodes[id]
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x)
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y)
  }
  if (!Number.isFinite(minX)) return []
  return [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }]
}

type Tri = [number[], number[], number[]] // [x, zUp, y]

function roofTris(floor: Floor): Tri[] {
  if (!floor.roof) return []
  const fp = footprintRect(floor)
  if (fp.length < 3) return []
  const mesh = generateRoof(fp, floor.elevation + floor.height, floor.roof)
  const P = (i: number) => [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]]
  const tris: Tri[] = []
  for (let i = 0; i + 2 < mesh.indices.length; i += 3) tris.push([P(mesh.indices[i]), P(mesh.indices[i + 1]), P(mesh.indices[i + 2])])
  return tris
}

/** Крыша в проекции: заливка треугольников и только значимые рёбра (контур и перегибы). */
function roofLayer(f: ViewFrame, tris: Tri[], minDepth: number): Layer | null {
  if (!tris.length) return null
  const polys: EPoly[] = []
  const key = (v: number[]) => `${Math.round(v[0])},${Math.round(v[1])},${Math.round(v[2])}`
  const normal = (t: Tri) => {
    const ax = t[1][0] - t[0][0], ay = t[1][1] - t[0][1], az = t[1][2] - t[0][2]
    const bx = t[2][0] - t[0][0], by = t[2][1] - t[0][1], bz = t[2][2] - t[0][2]
    const n = [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx]
    const L = Math.hypot(n[0], n[1], n[2]) || 1
    return n.map((c) => c / L)
  }
  const edges = new Map<string, { a: number[]; b: number[]; normals: number[][] }>()
  let depthSum = 0, count = 0
  for (const t of tris) {
    const pr = t.map((v) => project(f, { x: v[0], y: v[2] }))
    if (Math.max(...pr.map((p) => p.depth)) < minDepth) continue
    polys.push({ pts: pr.map((p, i) => ({ x: p.u, y: t[i][1] })), fill: "roof" })
    const n = normal(t)
    for (let i = 0; i < 3; i++) {
      const a = t[i], b = t[(i + 1) % 3]
      const ka = key(a), kb = key(b)
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
      const rec = edges.get(k) ?? { a, b, normals: [] }
      rec.normals.push(n)
      edges.set(k, rec)
    }
    depthSum += pr.reduce((s, p) => s + p.depth, 0) / 3
    count++
  }
  const lines: ELine[] = []
  for (const e of edges.values()) {
    const crease = e.normals.length !== 2 || e.normals[0][0] * e.normals[1][0] + e.normals[0][1] * e.normals[1][1] + e.normals[0][2] * e.normals[1][2] < 0.985
    if (!crease) continue
    const pa = project(f, { x: e.a[0], y: e.a[2] }), pb = project(f, { x: e.b[0], y: e.b[2] })
    if (Math.hypot(pa.u - pb.u, e.a[1] - e.b[1]) < 5) continue
    lines.push({ a: { x: pa.u, y: e.a[1] }, b: { x: pb.u, y: e.b[1] }, weight: "main" })
  }
  return { depth: count ? depthSum / count : 0, polys, lines }
}

/** Убирает вертикальные кромки там, где к грани вплотную примыкает соседняя грань той же плоскости. */
function removeSeams(layers: Layer[]): void {
  const seams = layers.flatMap((l) => l.lines.filter((ln) => ln.seam))
  const key = (ln: ELine) => `${ln.seam?.floor}|${Math.round(ln.a.x / 5)}`
  const groups = new Map<string, ELine[]>()
  for (const ln of seams) groups.set(key(ln), [...(groups.get(key(ln)) ?? []), ln])
  const drop = new Set<ELine>()
  for (const list of groups.values()) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]
      if (Math.abs((a.seam?.depth ?? 0) - (b.seam?.depth ?? 0)) < 60) { drop.add(a); drop.add(b) }
    }
  }
  for (const l of layers) l.lines = l.lines.filter((ln) => !drop.has(ln)).map((ln) => (ln.seam ? { a: ln.a, b: ln.b, weight: ln.weight } : ln))
}

function paint(layers: Layer[]): EItem[] {
  removeSeams(layers)
  // дальнее — раньше; линии слоя идут сразу за его заливкой, чтобы ближний слой их закрыл
  const sorted = [...layers].sort((a, b) => b.depth - a.depth)
  const items: EItem[] = []
  for (const l of sorted) {
    for (const p of l.polys) items.push({ t: "poly", ...p })
    for (const ln of l.lines) items.push({ t: "line", ...ln })
  }
  return items
}

function marksFor(floors: Floor[], topZ: number): { marks: ELevelMark[]; dims: EDim[]; names: { z: number; text: string }[] } {
  const sorted = [...floors].sort((a, b) => a.elevation - b.elevation)
  const marks: ELevelMark[] = []
  const seen = new Set<number>()
  const add = (z: number) => {
    const k = Math.round(z)
    if (seen.has(k)) return
    seen.add(k)
    marks.push({ z: k, text: levelText(k) })
  }
  add(0)
  for (const f of sorted) add(f.elevation)
  const last = sorted[sorted.length - 1]
  if (last) add(last.elevation + last.height)
  if (topZ > (last ? last.elevation + last.height : 0) + 50) add(topZ)
  const dims: EDim[] = sorted.map((f) => ({ z0: f.elevation, z1: f.elevation + f.height, text: String(Math.round(f.height)) }))
  const names = sorted.map((f) => ({ z: f.elevation + f.height / 2, text: floorLabel(f) }))
  marks.sort((a, b) => a.z - b.z)
  return { marks, dims, names }
}

function boundsOf(items: EItem[]): ElevationDrawing["bounds"] {
  let minU = Infinity, maxU = -Infinity, minZ = Infinity, maxZ = -Infinity
  const g = (p: Pt) => {
    minU = Math.min(minU, p.x); maxU = Math.max(maxU, p.x)
    minZ = Math.min(minZ, p.y); maxZ = Math.max(maxZ, p.y)
  }
  for (const it of items) {
    if (it.t === "poly") it.pts.forEach(g)
    else { g(it.a); g(it.b) }
  }
  if (!Number.isFinite(minU)) return { minU: 0, maxU: 10000, minZ: 0, maxZ: 3000 }
  return { minU, maxU, minZ, maxZ }
}

function visibleFloors(b: Building): Floor[] {
  return b.floors.filter((f) => f.visible !== false && Object.keys(f.wallGraph.edges).length > 0)
}

/** Центр здания в плане — начало отсчёта фасада (u = 0 посередине). */
function buildingCenter(floors: Floor[]): Vec2 {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const f of floors) for (const id in f.wallGraph.nodes) {
    const n = f.wallGraph.nodes[id]
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x)
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y)
  }
  return Number.isFinite(minX) ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } : { x: 0, y: 0 }
}

export function buildFacade(b: Building, side: FacadeSide): ElevationDrawing {
  const floors = visibleFloors(b)
  const d = FACADE_DIR[side]
  const frame: ViewFrame = { origin: buildingCenter(floors), d }
  const layers: Layer[] = []
  let topZ = 0
  for (const floor of floors) {
    for (const w of wallsOf(floor)) {
      if (!w.outward) continue
      // стена видна, если её наружная сторона смотрит на нас
      if (w.outward.x * d.x + w.outward.y * d.y > -0.2) continue
      const face = wallFace(frame, w)
      if (face) layers.push({ depth: face.depth - w.thickness / 2, polys: face.polys, lines: face.lines })
      topZ = Math.max(topZ, floor.elevation + w.height)
    }
    layers.push(...porchLayers(frame, floor, -Infinity))
    const roof = roofLayer(frame, roofTris(floor), -Infinity)
    if (roof) {
      layers.push({ ...roof, depth: -1e9 }) // крыша над стенами — поверх
      for (const p of roof.polys) for (const q of p.pts) topZ = Math.max(topZ, q.y)
    }
  }
  const items = paint(layers)
  const bounds = boundsOf(items)
  // земля
  items.push({ t: "line", a: { x: bounds.minU - 1500, y: 0 }, b: { x: bounds.maxU + 1500, y: 0 }, weight: "thick" })
  const m = marksFor(floors, topZ)
  return { kind: "facade", items, marks: m.marks.filter((x) => x.z >= 0), dims: m.dims.filter((x) => x.z1 > 0).map((x) => (x.z0 < 0 ? { z0: 0, z1: x.z1, text: String(Math.round(x.z1)) } : x)), floorNames: m.names.filter((x) => x.z > 0), bounds: { ...bounds, minZ: Math.min(bounds.minZ, 0) } }
}

export interface SectionLine {
  a: Vec2
  b: Vec2
  /** смотрим влево от направления a→b (1) или вправо (−1) */
  look: 1 | -1
}

/** Направление взгляда разреза: перпендикуляр к линии в сторону look. */
export function sectionFrame(s: SectionLine): ViewFrame {
  const L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) || 1
  const t = { x: (s.b.x - s.a.x) / L, y: (s.b.y - s.a.y) / L }
  // right(d) должен совпасть с t: d = (−t.y, t.x) → right = (t.x, t.y)
  const d = { x: -t.y * s.look, y: t.x * s.look }
  // при взгляде вправо ось листа идёт от b к a — начало в b
  return s.look === 1 ? { origin: s.a, d } : { origin: s.b, d }
}

export function buildSection(b: Building, s: SectionLine): ElevationDrawing {
  const floors = visibleFloors(b)
  const frame = sectionFrame(s)
  const L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)
  const EPS = 1
  const layers: Layer[] = []
  const cut: EPoly[] = []
  const cutLines: ELine[] = []
  let topZ = 0

  for (const floor of floors) {
    const walls = wallsOf(floor)
    for (const w of walls) {
      const pa = project(frame, w.a), pb = project(frame, w.b)
      const crosses = (pa.depth > EPS && pb.depth < -EPS) || (pa.depth < -EPS && pb.depth > EPS) || Math.abs(pa.depth) <= EPS || Math.abs(pb.depth) <= EPS
      const t = Math.abs(pa.depth - pb.depth) < 1e-6 ? -1 : pa.depth / (pa.depth - pb.depth)
      if (crosses && t >= -0.001 && t <= 1.001) {
        const u = pa.u + (pb.u - pa.u) * t
        if (u < -EPS || u > L + EPS) continue
        const WL = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)
        // ширина сечения стены вдоль линии разреза: толщина / |sin угла| (не больше 3 толщин)
        const sin = Math.abs((pb.depth - pa.depth) / WL)
        const half = Math.min(w.thickness * 3, w.thickness / Math.max(sin, 1e-3)) / 2
        const z0 = floor.elevation, z1 = floor.elevation + w.height
        topZ = Math.max(topZ, z1)
        const along = t * WL
        const hole = floor.openings.find((o) => o.wallId === w.id && along >= o.offset - o.width / 2 && along <= o.offset + o.width / 2)
        if (hole) {
          const hz0 = z0 + (hole.type === "door" ? 0 : hole.sillHeight)
          const hz1 = Math.min(z1, hz0 + hole.height)
          if (hz0 > z0) cut.push({ pts: rect(u - half, z0, u + half, hz0), fill: "cut" })
          if (hz1 < z1) cut.push({ pts: rect(u - half, hz1, u + half, z1), fill: "cut" })
          if (hole.type === "window") {
            // окно в разрезе: две линии рамы
            cutLines.push({ a: { x: u - half / 3, y: hz0 }, b: { x: u - half / 3, y: hz1 }, weight: "thin" })
            cutLines.push({ a: { x: u + half / 3, y: hz0 }, b: { x: u + half / 3, y: hz1 }, weight: "thin" })
          }
        } else cut.push({ pts: rect(u - half, z0, u + half, z1), fill: "cut" })
        continue
      }
      // за плоскостью разреза — видимая стена
      if (pa.depth > EPS && pb.depth > EPS) {
        const face = wallFace(frame, w)
        if (face && face.u1 > 0 && face.u0 < L) layers.push({ depth: face.depth, polys: face.polys, lines: face.lines })
      }
    }

    // перекрытие пола этажа по помещениям, которые пересекает линия
    for (const room of detectRooms(floor.wallGraph)) {
      for (const [u0, u1] of polygonCut(frame, room.polygon, L)) {
        cut.push({ pts: rect(u0, floor.elevation - SLAB, u1, floor.elevation), fill: "slab" })
      }
    }
    // покрытие верхнего этажа без скатной крыши
    const above = floors.some((o) => o !== floor && Math.abs(o.elevation - (floor.elevation + floor.height)) < 300)
    if (!above && (!floor.roof || floor.roof.type === "flat")) {
      for (const room of detectRooms(floor.wallGraph)) {
        for (const [u0, u1] of polygonCut(frame, room.polygon, L)) {
          cut.push({ pts: rect(u0, floor.elevation + floor.height, u1, floor.elevation + floor.height + SLAB), fill: "slab" })
        }
      }
      topZ = Math.max(topZ, floor.elevation + floor.height + SLAB)
    }

    layers.push(...porchLayers(frame, floor, EPS))
    const tris = roofTris(floor)
    const beyond = roofLayer(frame, tris, EPS)
    if (beyond) layers.push({ ...beyond, depth: beyond.depth })
    // крыша в сечении: пересечение треугольников с плоскостью
    for (const t of tris) {
      const seg = triCut(frame, t)
      if (seg && seg[0].x >= -EPS - 2000 && seg[0].x <= L + 2000) {
        cutLines.push({ a: seg[0], b: seg[1], weight: "thick" })
        topZ = Math.max(topZ, seg[0].y, seg[1].y)
      }
    }
  }

  const items: EItem[] = [
    ...paint(layers),
    ...cut.map((p) => ({ t: "poly" as const, ...p })),
    ...cutLines.map((l) => ({ t: "line" as const, ...l })),
  ]
  const bounds = boundsOf(items)
  const minU = Math.min(bounds.minU, 0), maxU = Math.max(bounds.maxU, L)
  items.push({ t: "line", a: { x: minU - 1500, y: 0 }, b: { x: maxU + 1500, y: 0 }, weight: "thick" })
  const m = marksFor(floors, topZ)
  return { kind: "section", items, marks: m.marks, dims: m.dims, floorNames: m.names, bounds: { minU, maxU, minZ: Math.min(bounds.minZ, 0), maxZ: bounds.maxZ } }
}

/** Отрезки u, где секущая линия проходит внутри многоугольника (в пределах 0..L). */
function polygonCut(frame: ViewFrame, poly: Vec2[], L: number): Array<[number, number]> {
  const us: number[] = []
  for (let i = 0; i < poly.length; i++) {
    const p = project(frame, poly[i]), q = project(frame, poly[(i + 1) % poly.length])
    if ((p.depth > 0) === (q.depth > 0)) continue
    const t = p.depth / (p.depth - q.depth)
    us.push(p.u + (q.u - p.u) * t)
  }
  us.sort((a, b) => a - b)
  const out: Array<[number, number]> = []
  for (let i = 0; i + 1 < us.length; i += 2) {
    const u0 = Math.max(0, us[i]), u1 = Math.min(L, us[i + 1])
    if (u1 - u0 > 10) out.push([u0, u1])
  }
  return out
}

function triCut(frame: ViewFrame, t: Tri): [Pt, Pt] | null {
  const pr = t.map((v) => ({ ...project(frame, { x: v[0], y: v[2] }), z: v[1] }))
  const pts: Pt[] = []
  for (let i = 0; i < 3; i++) {
    const p = pr[i], q = pr[(i + 1) % 3]
    if ((p.depth > 0) === (q.depth > 0)) continue
    const k = p.depth / (p.depth - q.depth)
    pts.push({ x: p.u + (q.u - p.u) * k, y: p.z + (q.z - p.z) * k })
  }
  return pts.length === 2 && Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) > 5 ? [pts[0], pts[1]] : null
}

export const FACADE_TITLE: Record<FacadeSide, string> = {
  south: "Фасад южный",
  north: "Фасад северный",
  west: "Фасад западный",
  east: "Фасад восточный",
}
