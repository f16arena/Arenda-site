// Чертёж плана этажа из модели конструктора — как лист архитектурного раздела.
//
// Чистая функция без движка и DOM: этаж → набор примитивов в миллиметрах
// модели (ось Y вверх, как в CAD). Из этого же набора рисуются лист SVG/PDF
// и файл DXF для AutoCAD, поэтому они не расходятся.
//
// Что на плане (ГОСТ 21.501 / 21.101 в разумном минимуме):
// - стены с заливкой, проёмы разрывами; двери — полотно и дуга открывания,
//   окна — три линии по толщине стены
// - помещения: номер карточки и площадь, м²
// - размерные цепочки снаружи: 1 — проёмы и простенки, 2 — между узлами
//   стен (оси), 3 — габарит
// - координационные оси по наружным и несущим стенам: цифры по горизонтали,
//   буквы по вертикали

import { stairPlanRects } from "@/core/geometry/stair-generator"
import type { Floor } from "@/types/builder"
import { detectRooms } from "@/core/geometry/room-detection"
import { centroid, pointInPolygon } from "@/core/geometry/math"

export type Pt = { x: number; y: number }
export type Side = "top" | "bottom" | "left" | "right"

export interface DimensionLine {
  a: Pt
  b: Pt
  side: Side
  /** 1 — проёмы/простенки, 2 — между узлами стен, 3 — габарит */
  level: 1 | 2 | 3
  text: string
  /** координата края всего плана с этой стороны (мм модели): размерные линии
   *  откладываются от него, чтобы не налезать на тамбуры и пристройки */
  edge: number
}

export interface AxisLine {
  /** вертикальная ось (x = const) или горизонтальная (y = const) */
  dir: "v" | "h"
  at: number
  label: string
}

export interface RoomLabel {
  at: Pt
  number: string | null
  areaM2: number
}

export interface FloorDrawing {
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  /** четырёхугольники стен (заливка) */
  wallSolids: Pt[][]
  /** тонкие линии: окна, полотна дверей */
  thinLines: Array<[Pt, Pt]>
  /** дуги открывания дверей: центр, радиус, углы в градусах против часовой */
  arcs: Array<{ c: Pt; r: number; start: number; end: number }>
  rooms: RoomLabel[]
  dims: DimensionLine[]
  axes: AxisLine[]
}

const EPS = 5 // мм: узлы на одной линии фасада

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k })
const len = (a: Pt) => Math.hypot(a.x, a.y)
const deg = (a: Pt) => (Math.atan2(a.y, a.x) * 180) / Math.PI

/** Размер для подписи: мм без единиц, как принято на строительных чертежах. */
export function dimText(mm: number): string {
  return String(Math.round(mm))
}

/** Площадь по-русски: 31,5 */
export function areaText(m2: number): string {
  return m2.toFixed(1).replace(".", ",")
}

function uniqSorted(values: number[]): number[] {
  const out: number[] = []
  for (const v of [...values].sort((p, q) => p - q)) {
    if (out.length === 0 || Math.abs(v - out[out.length - 1]) > EPS) out.push(v)
  }
  return out
}

/** Точка внутри многоугольника для подписи: центр тяжести или ближайшая внутренняя. */
function labelPoint(poly: Pt[]): Pt {
  const c = centroid(poly)
  if (pointInPolygon(c, poly)) return c
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  let best: Pt = c
  let bestD = Infinity
  const n = 12
  for (let i = 1; i < n; i++) {
    for (let j = 1; j < n; j++) {
      const p = { x: minX + ((maxX - minX) * i) / n, y: minY + ((maxY - minY) * j) / n }
      if (!pointInPolygon(p, poly)) continue
      const d = Math.hypot(p.x - c.x, p.y - c.y)
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
  }
  return best
}

function axisLabelsLetters(n: number): string[] {
  // ГОСТ 21.101: буквы русского алфавита без Ё, З, Й, О, Х, Ц, Ч, Щ, Ъ, Ы, Ь
  const letters = "АБВГДЕЖИКЛМНПРСТУФШЭЮЯ".split("")
  return Array.from({ length: n }, (_, i) => (i < letters.length ? letters[i] : `${letters[i % letters.length]}${Math.floor(i / letters.length)}`))
}

export function buildFloorDrawing(floor: Floor, premiseNumber: (premiseId: string) => string | null = () => null): FloorDrawing {
  const g = floor.wallGraph
  const degree = new Map<string, number>()
  for (const id in g.edges) {
    const e = g.edges[id]
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1)
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1)
  }

  const wallSolids: Pt[][] = []
  const thinLines: Array<[Pt, Pt]> = []
  const arcs: FloorDrawing["arcs"] = []
  const openingsByWall = new Map<string, Floor["openings"]>()
  for (const o of floor.openings) {
    const list = openingsByWall.get(o.wallId) ?? []
    list.push(o)
    openingsByWall.set(o.wallId, list)
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  for (const id in g.edges) {
    const e = g.edges[id]
    const a = g.nodes[e.a]
    const b = g.nodes[e.b]
    if (!a || !b) continue
    const d = sub(b, a)
    const L = len(d)
    if (L < 1) continue
    const u = mul(d, 1 / L)
    const nrm = { x: -u.y, y: u.x }
    const h = e.thickness / 2
    // стык: продлеваем на полтолщины, чтобы углы закрывались без щелей
    const extA = (degree.get(e.a) ?? 0) > 1 ? h : 0
    const extB = (degree.get(e.b) ?? 0) > 1 ? h : 0
    const ops = [...(openingsByWall.get(id) ?? [])].sort((p, q) => p.offset - q.offset)
    const gaps = ops.map((o) => [Math.max(0, o.offset), Math.min(L, o.offset + o.width)] as const)
    let s = -extA
    const pushSolid = (s0: number, s1: number) => {
      if (s1 - s0 < 1) return
      const p0 = add(a, mul(u, s0)), p1 = add(a, mul(u, s1))
      wallSolids.push([add(p0, mul(nrm, h)), add(p1, mul(nrm, h)), add(p1, mul(nrm, -h)), add(p0, mul(nrm, -h))])
    }
    for (const [g0, g1] of gaps) {
      pushSolid(s, g0)
      s = g1
    }
    pushSolid(s, L + extB)

    for (const o of ops) {
      const p0 = add(a, mul(u, o.offset))
      const p1 = add(a, mul(u, o.offset + o.width))
      if (o.type === "window") {
        for (const k of [h, 0, -h]) thinLines.push([add(p0, mul(nrm, k)), add(p1, mul(nrm, k))])
        thinLines.push([add(p0, mul(nrm, h)), add(p0, mul(nrm, -h))])
        thinLines.push([add(p1, mul(nrm, h)), add(p1, mul(nrm, -h))])
      } else {
        // полотно от петли перпендикулярно стене и четверть окружности открывания
        const hinge = add(p0, mul(nrm, h))
        const leafEnd = add(hinge, mul(nrm, o.width))
        thinLines.push([hinge, leafEnd])
        const a0 = deg(u)
        const a1 = deg(nrm)
        // дуга от конца проёма (направление u) до полотна (направление n), против часовой
        let start = a0, end = a1
        if (((end - start + 360) % 360) > 180) [start, end] = [end, start]
        arcs.push({ c: hinge, r: o.width, start, end })
      }
    }

    for (const p of [a, b]) {
      minX = Math.min(minX, p.x - h); maxX = Math.max(maxX, p.x + h)
      minY = Math.min(minY, p.y - h); maxY = Math.max(maxY, p.y + h)
    }
  }
  // лестницы и крыльца: контуры ступеней тонкими линиями
  for (const st of floor.stairs) {
    for (const q of stairPlanRects(st, floor.height)) {
      for (let i = 0; i < 4; i++) thinLines.push([q[i], q[(i + 1) % 4]])
      if (Number.isFinite(minX)) {
        for (const c of q) {
          minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x)
          minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y)
        }
      }
    }
  }
  if (!Number.isFinite(minX)) {
    minX = 0; minY = 0; maxX = 10000; maxY = 10000
  }

  // помещения
  const rooms: RoomLabel[] = detectRooms(g).map((r) => {
    const key = floor.premiseLinks[r.id]
    return { at: labelPoint(r.polygon), number: key ? premiseNumber(key) : null, areaM2: r.areaMm2 / 1_000_000 }
  })

  // размерные цепочки по четырём фасадам
  const dims: DimensionLine[] = []
  type Hor = { y: number; x0: number; x1: number; id: string; t: number }
  type Ver = { x: number; y0: number; y1: number; id: string; t: number }
  const hor: Hor[] = []
  const ver: Ver[] = []
  for (const id in g.edges) {
    const e = g.edges[id]
    const a = g.nodes[e.a], b = g.nodes[e.b]
    if (!a || !b || e.kind !== "exterior") continue
    if (Math.abs(a.y - b.y) < EPS) hor.push({ y: (a.y + b.y) / 2, x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), id, t: e.thickness })
    else if (Math.abs(a.x - b.x) < EPS) ver.push({ x: (a.x + b.x) / 2, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y), id, t: e.thickness })
  }

  const chain = (side: Side) => {
    const isH = side === "top" || side === "bottom"
    const lines = isH ? hor : ver
    if (lines.length === 0) return
    const coord = (l: Hor | Ver) => (isH ? (l as Hor).y : (l as Ver).x)
    const target = side === "top" || side === "right" ? Math.max(...lines.map(coord)) : Math.min(...lines.map(coord))
    const onFace = lines.filter((l) => Math.abs(coord(l) - target) < EPS)
    const t = Math.max(...onFace.map((l) => l.t))
    const outer = side === "top" || side === "right" ? target + t / 2 : target - t / 2
    const lo = Math.min(...onFace.map((l) => (isH ? (l as Hor).x0 : (l as Ver).y0))) - t / 2
    const hi = Math.max(...onFace.map((l) => (isH ? (l as Hor).x1 : (l as Ver).y1))) + t / 2
    const pt = (s: number): Pt => (isH ? { x: s, y: outer } : { x: outer, y: s })

    // уровень 2: узлы стен на фасаде (включая примыкания перегородок)
    const nodeStops: number[] = [lo, hi]
    for (const nid in g.nodes) {
      const n = g.nodes[nid]
      const along = isH ? n.x : n.y
      const across = isH ? n.y : n.x
      if (Math.abs(across - target) < EPS && along > lo - EPS && along < hi + EPS) nodeStops.push(along)
    }
    // уровень 1: края проёмов на стенах фасада
    const openStops: number[] = [...nodeStops]
    for (const l of onFace) {
      const e = g.edges[l.id]
      const a = g.nodes[e.a], b = g.nodes[e.b]
      const dirSign = (isH ? b.x - a.x : b.y - a.y) >= 0 ? 1 : -1
      const base = isH ? a.x : a.y
      for (const o of openingsByWall.get(l.id) ?? []) {
        openStops.push(base + dirSign * o.offset, base + dirSign * (o.offset + o.width))
      }
    }
    const n2 = uniqSorted(nodeStops)
    const n1 = uniqSorted(openStops)
    const push = (stops: number[], level: 1 | 2 | 3) => {
      for (let i = 0; i < stops.length - 1; i++) {
        dims.push({ a: pt(stops[i]), b: pt(stops[i + 1]), side, level, text: dimText(stops[i + 1] - stops[i]), edge: 0 })
      }
    }
    if (n1.length > n2.length) push(n1, 1)
    if (n2.length > 2) push(n2, 2)
    push([lo, hi], 3)
  }
  chain("top")
  chain("left")
  chain("bottom")
  chain("right")
  for (const dm of dims) {
    dm.edge = dm.side === "top" ? maxY : dm.side === "bottom" ? minY : dm.side === "left" ? minX : maxX
  }

  // оси: по наружным и несущим (не перегородкам) стенам, строго вертикальным/горизонтальным
  const vx: number[] = []
  const hy: number[] = []
  const extX = hor.length ? [Math.min(...hor.map((l) => l.x0)), Math.max(...hor.map((l) => l.x1))] : [-Infinity, Infinity]
  const extY = ver.length ? [Math.min(...ver.map((l) => l.y0)), Math.max(...ver.map((l) => l.y1))] : [-Infinity, Infinity]
  for (const id in g.edges) {
    const e = g.edges[id]
    if (e.kind === "partition") continue
    const a = g.nodes[e.a], b = g.nodes[e.b]
    if (!a || !b) continue
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    // ось — несущая стена здания: наружная или внутренняя длиной от 6 м, не пристройка
    if (e.kind !== "exterior" && L < 6000) continue
    const inside = (p: Pt) => p.x >= extX[0] - EPS && p.x <= extX[1] + EPS && p.y >= extY[0] - EPS && p.y <= extY[1] + EPS
    if (!inside(a) || !inside(b)) continue
    if (Math.abs(a.x - b.x) < EPS) vx.push(a.x)
    else if (Math.abs(a.y - b.y) < EPS) hy.push(a.y)
  }
  const vAxes = uniqSorted(vx)
  const hAxes = uniqSorted(hy)
  const letters = axisLabelsLetters(hAxes.length)
  const axes: AxisLine[] = [
    ...vAxes.map((at, i) => ({ dir: "v" as const, at, label: String(i + 1) })),
    ...hAxes.map((at, i) => ({ dir: "h" as const, at, label: letters[i] })),
  ]

  return { bounds: { minX, minY, maxX, maxY }, wallSolids, thinLines, arcs, rooms, dims, axes }
}

// ── лист ─────────────────────────────────────────────────────────────────────

export const STAMP = { w: 185, h: 55 }
const SCALES = [50, 75, 100, 125, 150, 200, 250, 300, 400, 500]

/** Отступ под размеры и оси на листе, мм листа */
export const DIM_BASE = 8
export const DIM_STEP = 8
export const AXIS_GAP = 10
export const BUBBLE_R = 4

export type Sheet = { w: number; h: number; scale: number; format: "A3" | "A2"; orientation: "landscape" | "portrait" }

/** Рабочее поле листа: рамка 20/5/5/5 мм, над штампом, с полями под размеры и оси. */
function fits(drawing: FloorDrawing, w: number, h: number, scale: number): boolean {
  const margin = DIM_BASE + DIM_STEP * 3 + AXIS_GAP + BUBBLE_R * 2 + 2
  const areaW = w - 20 - 5 - 10
  const areaH = h - 5 - 5 - STAMP.h - 5
  const dw = drawing.bounds.maxX - drawing.bounds.minX
  const dh = drawing.bounds.maxY - drawing.bounds.minY
  return dw / scale + 2 * margin <= areaW && dh / scale + 2 * margin <= areaH
}

/**
 * Лист и масштаб: самый крупный стандартный масштаб, при котором план с
 * размерами и осями помещается. Сначала А3 в ориентации по форме плана
 * (вытянутый этаж — книжная), потом А2.
 */
export function pickSheet(drawing: FloorDrawing): Sheet {
  const tall = drawing.bounds.maxY - drawing.bounds.minY > drawing.bounds.maxX - drawing.bounds.minX
  const options: Array<Omit<Sheet, "scale">> = [
    tall ? { w: 297, h: 420, format: "A3", orientation: "portrait" } : { w: 420, h: 297, format: "A3", orientation: "landscape" },
    tall ? { w: 420, h: 594, format: "A2", orientation: "portrait" } : { w: 594, h: 420, format: "A2", orientation: "landscape" },
  ]
  // А3 в масштабе до 1:200 — привычный рабочий лист; если не влезает — А2, потом мельче
  for (const scale of SCALES.filter((x) => x <= 200)) if (fits(drawing, options[0].w, options[0].h, scale)) return { ...options[0], scale }
  for (const scale of SCALES) if (fits(drawing, options[1].w, options[1].h, scale)) return { ...options[1], scale }
  for (const scale of SCALES) if (fits(drawing, options[0].w, options[0].h, scale)) return { ...options[0], scale }
  return { ...options[1], scale: SCALES[SCALES.length - 1] }
}
