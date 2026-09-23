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

import { roomDisplayName, roomUse, type RoomUse } from "@/lib/builder/room-use"
import { floorRooms } from "@/lib/builder/rooms"
import { floorAtStage } from "@/lib/builder/replan"
import { generateStair, RAMP_SLOPE, stairPlanRects, stairToWorld } from "@/core/geometry/stair-generator"
import { stairHoleWorld } from "@/lib/builder/stair-hole"
import { islandLabel, islandMark, islandPolygon } from "../islands"
import type { SheetT } from "@/lib/builder/sheet-text"
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
  roomId: string
  at: Pt
  number: string | null
  areaM2: number
  /** МОП/техническое — без номера, с наименованием и штриховкой */
  use: RoomUse
  name: string
  polygon: Pt[]
  holes: Pt[][]
}

export interface DrawingOptions {
  /** марки проёмов по всему зданию (id проёма → «ОК-1») */
  openingMarks?: Map<string, string>
  /** номера помещений для неподвязанных к карточкам (roomId → «105») */
  roomNumbers?: Map<string, string>
  /**
   * Переводчик для подписей на плане: наименование помещения, вид арендного
   * места, «Лифт», уклон пандуса. Без него в подписи попадут ключи словаря —
   * так план видят только тесты.
   */
  t?: SheetT
}

/** Стадия листа: обмерный план (было), демонтаж, монтаж, стало. */
export type PlanStage = "plan" | "demolish" | "install" | "after" | "edit"
export type WallStyle = "solid" | "demolish" | "new"

export interface FloorDrawing {
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  /** четырёхугольники стен (заливка) */
  wallSolids: Pt[][]
  /** стиль каждой стены из wallSolids: демонтаж — пунктир с крестом, новая — штриховка */
  wallStyles: WallStyle[]
  /** пробиваемые (демонтаж) и закладываемые (монтаж) участки проёмов */
  patches: Array<{ q: Pt[]; style: "demolish" | "new" }>
  /** размеры и надписи, поставленные инженером */
  userDims: Array<{ a: Pt; b: Pt; offset: number }>
  texts: Array<{ at: Pt; text: string }>
  /** марки проёмов у стены: снаружи окна, со стороны открывания двери */
  marks: Array<{ at: Pt; text: string; base: Pt; n: Pt; half: number }>
  /** стрелки хода лестниц (ломаная через центры ступеней, стрелка вверх) */
  stairArrows: Pt[][]
  /** контур лестничного проёма (выреза в перекрытии) — обводится на плане */
  stairWells: Pt[][]
  /** арендные места в общих зонах: габарит, марка и подпись */
  islands: Array<{ poly: Pt[]; at: Pt; mark: string; text: string }>
  /** лифты: контур шахты, кабина с крестом */
  lifts: Array<{ shaft: Pt[]; cabin: Pt[]; label: string }>
  /** выходы: точка у двери снаружи, направление наружу, вид */
  exits: Array<{ at: Pt; dir: Pt; kind: "main" | "emergency" }>
  /** тонкие линии: окна, полотна дверей */
  thinLines: Array<[Pt, Pt]>
  /** дуги открывания дверей: центр, радиус, углы в градусах против часовой */
  arcs: Array<{ c: Pt; r: number; start: number; end: number }>
  rooms: RoomLabel[]
  dims: DimensionLine[]
  axes: AxisLine[]
  /** отметка уровня чистого пола этажа */
  levelMark: { at: Pt; text: string }
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

/**
 * Точка подписи помещения: самое просторное место внутри — максимум расстояния
 * до стен (грубый «полюс недоступности» по сетке). В узком Г-образном коридоре
 * центр тяжести лежит у стены или вовсе снаружи — подпись налезала на двери.
 */
export function labelPoint(poly: Pt[], holes: Pt[][] = []): Pt {
  const c = centroid(poly)
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const rings = [poly, ...holes]
  const edgeDist = (p: Pt) => {
    let d = Infinity
    for (const ring of rings) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length]
      const dx = b.x - a.x, dy = b.y - a.y
      const L2 = dx * dx + dy * dy || 1
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2))
      d = Math.min(d, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)))
    }
    return d
  }
  let best: Pt = c
  const free = (p: Pt) => pointInPolygon(p, poly) && !holes.some((h) => pointInPolygon(p, h))
  let bestScore = free(c) ? edgeDist(c) : -Infinity
  const n = 24
  const span = Math.max(maxX - minX, maxY - minY) || 1
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const p = { x: minX + ((maxX - minX) * i) / n, y: minY + ((maxY - minY) * j) / n }
      if (!free(p)) continue
      // простор важнее близости к центру; при равенстве — ближе к центру
      const score = edgeDist(p) - (Math.hypot(p.x - c.x, p.y - c.y) / span) * 50
      if (score > bestScore) {
        bestScore = score
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

export function buildFloorDrawing(source: Floor, premiseNumber: (premiseId: string) => string | null = () => null, stage: PlanStage = "plan", options: DrawingOptions = {}): FloorDrawing {
  // обмерный план и план демонтажа — «было», монтаж и итог — «стало»
  // редактор плана («edit») показывает модель целиком: и сносимое, и новое
  const floor = stage === "edit" ? source : floorAtStage(source, stage === "plan" || stage === "demolish" ? "before" : "after")
  const g = floor.wallGraph
  const degree = new Map<string, number>()
  for (const id in g.edges) {
    const e = g.edges[id]
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1)
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1)
  }

  const marks: FloorDrawing["marks"] = []
  const wallSolids: Pt[][] = []
  const wallStyles: WallStyle[] = []
  const patches: FloorDrawing["patches"] = []
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
    // стык: продлеваем ровно до дальней грани стены, в которую упираемся (её
    // полтолщины). Раньше — на свою полтолщины: толстая стена, упёршаяся в
    // тонкую перегородку, торчала за неё. Продолжение по прямой — без продления.
    const extAt = (nodeId: string) => {
      let ext = 0
      for (const oid in g.edges) {
        if (oid === id) continue
        const o = g.edges[oid]
        if (o.a !== nodeId && o.b !== nodeId) continue
        const oa = g.nodes[o.a], ob = g.nodes[o.b]
        if (!oa || !ob) continue
        const ol = Math.hypot(ob.x - oa.x, ob.y - oa.y) || 1
        const cross = Math.abs(u.x * ((ob.y - oa.y) / ol) - u.y * ((ob.x - oa.x) / ol))
        if (cross < 0.1) continue // та же линия
        ext = Math.max(ext, o.thickness / 2)
      }
      return ext
    }
    const extA = (degree.get(e.a) ?? 0) > 1 ? extAt(e.a) : 0
    const extB = (degree.get(e.b) ?? 0) > 1 ? extAt(e.b) : 0
    const ops = [...(openingsByWall.get(id) ?? [])].sort((p, q) => p.offset - q.offset)
    // offset проёма — его центр вдоль стены (как в ядре и 3D)
    const gaps = ops.map((o) => [Math.max(0, o.offset - o.width / 2), Math.min(L, o.offset + o.width / 2)] as const)
    let s = -extA
    const style: WallStyle = (stage === "demolish" || stage === "edit") && e.phase === "demolish" ? "demolish" : (stage === "install" || stage === "edit") && e.phase === "new" ? "new" : "solid"
    const pushSolid = (s0: number, s1: number) => {
      if (s1 - s0 < 1) return
      const p0 = add(a, mul(u, s0)), p1 = add(a, mul(u, s1))
      wallSolids.push([add(p0, mul(nrm, h)), add(p1, mul(nrm, h)), add(p1, mul(nrm, -h)), add(p0, mul(nrm, -h))])
      wallStyles.push(style)
    }
    // проёмы, которых на этой стадии нет, но они меняются: пробивка (на демонтаже) и закладка (на монтаже)
    for (const o of source.openings) {
      if (o.wallId !== id) continue
      const punch = stage === "demolish" && o.phase === "new"
      const fill = stage === "install" && o.phase === "demolish"
      if (!punch && !fill) continue
      const p0 = add(a, mul(u, o.offset - o.width / 2)), p1 = add(a, mul(u, o.offset + o.width / 2))
      patches.push({ q: [add(p0, mul(nrm, h)), add(p1, mul(nrm, h)), add(p1, mul(nrm, -h)), add(p0, mul(nrm, -h))], style: punch ? "demolish" : "new" })
    }
    for (const [g0, g1] of gaps) {
      pushSolid(s, g0)
      s = g1
    }
    pushSolid(s, L + extB)

    for (const o of ops) {
      const mark = options.openingMarks?.get(o.id)
      if (mark) {
        const c = add(a, mul(u, o.offset))
        // окно — марка по левой стороне стены, дверь — со стороны полотна
        const side = o.type === "window" ? -1 : 1
        marks.push({ at: add(c, mul(nrm, (h + 450) * side)), text: mark, base: c, n: mul(nrm, side), half: h })
      }
      const p0 = add(a, mul(u, o.offset - o.width / 2))
      const p1 = add(a, mul(u, o.offset + o.width / 2))
      if (o.type === "door" && o.variant === "arch") {
        // арка: проём без полотна — поперечные линии по откосам
        thinLines.push([add(p0, mul(nrm, h)), add(p0, mul(nrm, -h))])
        thinLines.push([add(p1, mul(nrm, h)), add(p1, mul(nrm, -h))])
      } else if (o.type === "window") {
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
  // лестницы и крыльца: контуры ступеней тонкими линиями; лифты — шахта и кабина
  const stairArrows: FloorDrawing["stairArrows"] = []
  // подписи уклона пандусов — добавляются к текстам плана ниже
  const rampLabels: FloorDrawing["texts"] = []
  const stairWells: FloorDrawing["stairWells"] = []
  const lifts: FloorDrawing["lifts"] = []
  for (const st of floor.stairs) {
    const rects = stairPlanRects(st, floor.height)
    if (st.shape === "column") {
      // колонна — сечение в разрезе, заливкой как стена
      for (const q of rects) { wallSolids.push(q); wallStyles.push("solid") }
      continue
    }
    if (st.shape === "elevator") {
      const hole = stairHoleWorld(st, floor.height)
      const geo = generateStair("elevator", floor.height, st.width, false)
      const cab = geo.rails[0]
      lifts.push({
        shaft: hole,
        cabin: [
          stairToWorld(st, cab.x - cab.w / 2, cab.z - cab.d / 2), stairToWorld(st, cab.x + cab.w / 2, cab.z - cab.d / 2),
          stairToWorld(st, cab.x + cab.w / 2, cab.z + cab.d / 2), stairToWorld(st, cab.x - cab.w / 2, cab.z + cab.d / 2),
        ],
        label: options.t ? options.t("adminBuilderSheet.sheetText.elevatorMark") : "elevatorMark",
      })
      for (const c of hole) {
        minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x)
        minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y)
      }
      continue
    }
    if (st.shape === "ramp") {
      // пандус: подпись с уклоном по центру марша — по ней проверяют норматив
      const all = rects.flat()
      const cx = all.reduce((a, q) => a + q.x, 0) / all.length
      const cy = all.reduce((a, q) => a + q.y, 0) / all.length
      rampLabels.push({ at: { x: cx, y: cy }, text: options.t ? options.t("adminBuilderSheet.sheetText.rampSlope", { slope: RAMP_SLOPE }) : `i=1:${RAMP_SLOPE}` })
    }
    if (st.shape !== "porch" && st.shape !== "ramp" && rects.length >= 2) {
      stairArrows.push(rects.map((q) => ({ x: (q[0].x + q[2].x) / 2, y: (q[0].y + q[2].y) / 2 })))
      // проём в перекрытии обводится: на плане видно габарит лестничной клетки
      stairWells.push(stairHoleWorld(st, floor.height))
    }
    for (const q of rects) {
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
  const rooms: RoomLabel[] = floorRooms({ wallGraph: g, stairs: floor.stairs, height: floor.height }).map((r) => {
    const key = floor.premiseLinks[r.id]
    // подпись обходит лестницы, лифты и колонны, стоящие в этом помещении (центр
    // внутри); лестница, заходящая краем из соседнего помещения, подпись не двигает
    const obstacles = floor.stairs.map((st) => stairHoleWorld(st, floor.height)).filter((h) => pointInPolygon({ x: (h[0].x + h[2].x) / 2, y: (h[0].y + h[2].y) / 2 }, r.polygon))
    const use = roomUse(floor, r)
    const number = use === "rent" ? (key ? premiseNumber(key) : null) ?? options.roomNumbers?.get(r.id) ?? null : null
    return { roomId: r.id, at: labelPoint(r.polygon, [...(r.holes ?? []), ...obstacles]), number, areaM2: r.areaMm2 / 1_000_000, use, name: use === "rent" ? "" : roomDisplayName(floor, r, (key) => (options.t ? options.t(`adminBuilder.roomNames.${key}`) : key)), polygon: r.polygon, holes: r.holes ?? [] }
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
        openStops.push(base + dirSign * (o.offset - o.width / 2), base + dirSign * (o.offset + o.width / 2))
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

  const exits = exitArrows(floor)

  const userDims = (source.annotations ?? []).flatMap((x) => (x.kind === "dim" ? [{ a: x.a, b: x.b, offset: x.offset }] : []))
  const texts = [
    ...rampLabels,
    ...(source.annotations ?? []).flatMap((x) => (x.kind === "text" ? [{ at: x.at, text: x.text }] : [])),
  ]
  // отметка уровня пола: ±0,000 у первого этажа, у остальных — от него
  const lvl = (source.elevation ?? 0) / 1000
  const levelText = Math.abs(lvl) < 0.0005 ? "±0,000" : `${lvl > 0 ? "+" : "−"}${Math.abs(lvl).toFixed(3).replace(".", ",")}`
  // ставим внутрь здания, ниже верхней стены — чтобы не наезжать на марки окон
  const islandShapes: FloorDrawing["islands"] = (floor.islands ?? []).map((isl, i) => ({
    poly: islandPolygon(isl),
    at: { x: isl.position.x, y: isl.position.y },
    mark: islandMark(floor.level, i),
    text: islandLabel(isl, (kind) => (options.t ? options.t(`adminBuilder.islands.kinds.${kind}`) : kind)),
  }))
  const levelMark = { at: { x: minX + (maxX - minX) * 0.22, y: maxY - 2600 }, text: levelText }

  return { levelMark, bounds: { minX, minY, maxX, maxY }, wallSolids, wallStyles, patches, userDims, texts, marks, stairArrows, stairWells, lifts, islands: islandShapes, exits, thinLines, arcs, rooms, dims, axes }
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
function fits(drawing: FloorDrawing, w: number, h: number, scale: number, reserveRight = 0): boolean {
  const margin = DIM_BASE + DIM_STEP * 3 + AXIS_GAP + BUBBLE_R * 2 + 2
  const areaW = w - 20 - 5 - 10 - reserveRight
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
export function pickSheet(drawing: FloorDrawing, reserveRight = 0): Sheet {
  // колонка таблиц справа (сети) делает лист «шире» — ориентацию выбираем с её учётом
  const tall = drawing.bounds.maxY - drawing.bounds.minY > drawing.bounds.maxX - drawing.bounds.minX + reserveRight * 100
  const options: Array<Omit<Sheet, "scale">> = [
    tall ? { w: 297, h: 420, format: "A3", orientation: "portrait" } : { w: 420, h: 297, format: "A3", orientation: "landscape" },
    tall ? { w: 420, h: 594, format: "A2", orientation: "portrait" } : { w: 594, h: 420, format: "A2", orientation: "landscape" },
  ]
  // А3 в масштабе до 1:200 — привычный рабочий лист; если не влезает — А2, потом мельче
  for (const scale of SCALES.filter((x) => x <= 200)) if (fits(drawing, options[0].w, options[0].h, scale, reserveRight)) return { ...options[0], scale }
  for (const scale of SCALES) if (fits(drawing, options[1].w, options[1].h, scale, reserveRight)) return { ...options[1], scale }
  for (const scale of SCALES) if (fits(drawing, options[0].w, options[0].h, scale, reserveRight)) return { ...options[0], scale }
  return { ...options[1], scale: SCALES[SCALES.length - 1] }
}

/**
 * Стрелки выходов по пути эвакуации. Дверь в наружной стене — наружу. Дверь
 * между помещениями — в сторону помещения, откуда меньше дверей до выхода из
 * здания (поиск в ширину по дверям); без наружных дверей — в большее помещение.
 * exitReverse у проёма разворачивает стрелку вручную.
 */
export function exitArrows(floor: Pick<Floor, "wallGraph" | "openings">): FloorDrawing["exits"] {
  const g = floor.wallGraph
  const rooms = detectRooms(g)
  const roomAt = (p: Pt) => rooms.find((r) => pointInPolygon(p, r.polygon) && !(r.holes ?? []).some((h) => pointInPolygon(p, h)))
  type Door = { o: Floor["openings"][number]; c: Pt; n: Pt; half: number; left?: string; right?: string; exterior: boolean }
  const doors: Door[] = []
  for (const o of floor.openings) {
    if (o.type !== "door") continue
    const e = g.edges[o.wallId]
    const a = e && g.nodes[e.a], b = e && g.nodes[e.b]
    if (!e || !a || !b) continue
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    if (L < 1) continue
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
    const n = { x: -u.y, y: u.x }
    const c = { x: a.x + u.x * o.offset, y: a.y + u.y * o.offset }
    const probe = e.thickness / 2 + 300
    const left = roomAt({ x: c.x + n.x * probe, y: c.y + n.y * probe })?.id
    const right = roomAt({ x: c.x - n.x * probe, y: c.y - n.y * probe })?.id
    doors.push({ o, c, n, half: e.thickness / 2, left, right, exterior: !left || !right })
  }
  // расстояние в дверях до выхода наружу
  const hops = new Map<string, number>()
  const queue: string[] = []
  for (const d of doors) {
    if (!d.exterior || d.o.phase === "demolish") continue
    const inner = d.left ?? d.right
    if (inner && !hops.has(inner)) { hops.set(inner, 0); queue.push(inner) }
  }
  while (queue.length) {
    const r = queue.shift() as string
    const h = hops.get(r) as number
    for (const d of doors) {
      if (d.exterior || d.o.phase === "demolish") continue
      const other = d.left === r ? d.right : d.right === r ? d.left : undefined
      if (other && !hops.has(other)) { hops.set(other, h + 1); queue.push(other) }
    }
  }
  const areaOf = (id?: string) => rooms.find((r) => r.id === id)?.areaMm2 ?? 0
  const out: FloorDrawing["exits"] = []
  for (const d of doors) {
    if (!d.o.exit) continue
    let toLeft: boolean
    if (!d.left && d.right) toLeft = true // слева улица
    else if (d.left && !d.right) toLeft = false
    else {
      const hl = d.left ? hops.get(d.left) : undefined, hr = d.right ? hops.get(d.right) : undefined
      if (hl !== undefined || hr !== undefined) toLeft = (hl ?? Infinity) <= (hr ?? Infinity)
      else toLeft = areaOf(d.left) >= areaOf(d.right)
    }
    if (d.o.exitReverse) toLeft = !toLeft
    const dir = toLeft ? d.n : { x: -d.n.x, y: -d.n.y }
    out.push({ at: { x: d.c.x + dir.x * (d.half + 200), y: d.c.y + dir.y * (d.half + 200) }, dir, kind: d.o.exit })
  }
  return out
}
