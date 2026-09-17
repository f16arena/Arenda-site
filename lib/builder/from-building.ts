// ADR: Сборка проекта Building Studio из УЖЕ введённых данных здания (этажи,
// помещения, планы этажей). Генерация строго в одну сторону: данные → модель.
// Обратной записи нет — площадь помещения это условие договора и основание для
// начислений, её нельзя менять движением стены в 3D. Расхождения между моделью
// и карточкой возвращаются в отчёте и показываются человеку.
//
// Как и demo-проект (§9.1), документ собирается ТОЛЬКО командами документа —
// никакой геометрии в обход ядра.
//
// Два пути на этаж:
//   1. Есть сохранённый план (Floor.layoutJson, FloorLayoutV2) — точная сборка.
//   2. Плана нет, есть только помещения с площадями — общий контур здания
//      делится на комнаты нужной площади. Контур ОДИН на все этажи, иначе они
//      не складываются в здание. Грубо, но человеку есть что двигать.

import { uid } from "@/core/id"
import type { BuilderDocument, Floor, Building, Opening, Stair } from "@/types/builder"
import {
  type Command,
  AddBuildingCommand,
  AddFloorCommand,
  InsertWallCommand,
  AddOpeningCommand,
  AddStairCommand,
  LinkPremiseCommand,
  SetRoofCommand,
} from "@/core/document/commands"
import { emptyGraph, type WallDefaults } from "@/core/geometry/wall-graph"
import { detectRooms } from "@/core/geometry/room-detection"
import { closestOnSegment, type Vec2 } from "@/core/geometry/math"
import { isLayoutV2, type FloorLayoutV2, type FloorElement } from "@/lib/floor-layout"

// ── входные данные (то, что уже лежит в БД) ──────────────────────────────────

export type SourceSpace = {
  id: string
  number: string
  area: number // м²
  kind: string // RENTABLE | COMMON
}

export type SourceFloor = {
  id: string
  number: number
  name: string
  kind: string // FLOOR | TERRITORY
  totalArea: number | null
  layoutJson: string | null
  spaces: SourceSpace[]
}

export type SourceBuilding = {
  id: string
  name: string
  floors: SourceFloor[]
}

// ── отчёт для человека ───────────────────────────────────────────────────────

export type AreaMismatch = {
  spaceNumber: string
  cardM2: number // площадь из карточки помещения
  modelM2: number // площадь, посчитанная по контуру в модели
}

export type BuildReport = {
  floorsExact: number // собраны по сохранённому плану
  floorsApprox: number // разложены по площадям
  floorsSkipped: string[] // названия пропущенных (территория, пустые)
  roomsLinked: number // комнат привязано к помещениям
  spacesUnlinked: string[] // номера помещений, которым комната не нашлась
  mismatches: AreaMismatch[]
}

export type BuildFromBuildingResult = { doc: BuilderDocument; report: BuildReport }

// ── константы ────────────────────────────────────────────────────────────────

const DEFAULT_FLOOR_HEIGHT = 3500 // мм
const EXT: WallDefaults = { thickness: 300, height: DEFAULT_FLOOR_HEIGHT, kind: "exterior" }
const INT: WallDefaults = { thickness: 150, height: DEFAULT_FLOOR_HEIGHT, kind: "interior" }
/** Допуск привязки проёма к стене, мм. Дальше — дверь «висит в воздухе», пропускаем. */
const OPENING_SNAP_MM = 700
/** Округление координат при склейке общих рёбер, мм. */
const SNAP_MM = 10
/** Расхождение площади, начиная с которого о нём стоит сказать. */
const MISMATCH_TOLERANCE = 0.05 // 5%

// ── мелкие геометрические помощники ──────────────────────────────────────────

function centroid(poly: Vec2[]): Vec2 {
  let x = 0
  let y = 0
  for (const p of poly) {
    x += p.x
    y += p.y
  }
  return { x: x / poly.length, y: y / poly.length }
}

/** Лучевой алгоритм: лежит ли точка внутри контура. */
function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    const hit = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    if (hit) inside = !inside
  }
  return inside
}

function polygonAreaMm2(poly: Vec2[]): number {
  let s = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    s += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y)
  }
  return Math.abs(s / 2)
}

// ── описание одной комнаты в плане, уже в мм и в координатах конструктора ────

type PlannedRoom = {
  outline: Vec2[] // мм, по часовой или против — не важно
  spaceId: string | null
  label: string
}

type PlannedFloor = {
  rooms: PlannedRoom[]
  /** Явные стены-перегородки, нарисованные руками (мм). */
  walls: { a: Vec2; b: Vec2; thickness: number }[]
  openings: { at: Vec2; type: "door" | "window"; width: number }[]
  stairsAt: Vec2[]
  heightMm: number
}

// ── путь 1: точная сборка по сохранённому плану ──────────────────────────────

function planFromLayout(layout: FloorLayoutV2): PlannedFloor {
  // План хранится в метрах от левого верхнего угла холста; конструктор работает
  // в миллиметрах от центра. Переносим начало координат в центр холста.
  const cx = layout.width / 2
  const cy = layout.height / 2
  // на карте ось Y вниз, в модели — вверх: разворачиваем, чтобы этаж не перевернулся
  const toMm = (x: number, y: number): Vec2 => ({ x: (x - cx) * 1000, y: -(y - cy) * 1000 })

  const rooms: PlannedRoom[] = []
  const walls: PlannedFloor["walls"] = []
  const openings: PlannedFloor["openings"] = []
  const stairsAt: Vec2[] = []

  for (const el of layout.elements as FloorElement[]) {
    if (el.type === "rect") {
      rooms.push({
        outline: [
          toMm(el.x, el.y),
          toMm(el.x + el.width, el.y),
          toMm(el.x + el.width, el.y + el.height),
          toMm(el.x, el.y + el.height),
        ],
        spaceId: el.spaceId ?? null,
        label: el.label ?? "",
      })
    } else if (el.type === "polygon") {
      if (el.points.length < 3) continue
      rooms.push({
        outline: el.points.map((p) => toMm(p.x, p.y)),
        spaceId: el.spaceId ?? null,
        label: el.label ?? "",
      })
    } else if (el.type === "wall") {
      walls.push({
        a: toMm(el.x1, el.y1),
        b: toMm(el.x2, el.y2),
        thickness: Math.round((el.thickness ?? 0.15) * 1000),
      })
    } else if (el.type === "door") {
      openings.push({ at: toMm(el.x, el.y), type: "door", width: Math.round(el.width * 1000) })
    } else if (el.type === "window") {
      openings.push({ at: toMm(el.x, el.y), type: "window", width: Math.round(el.width * 1000) })
    } else if (el.type === "icon" && el.kind === "stairs") {
      stairsAt.push(toMm(el.x, el.y))
    }
  }

  const heightMm = layout.ceilingHeight ? Math.round(layout.ceilingHeight * 1000) : DEFAULT_FLOOR_HEIGHT
  return { rooms, walls, openings, stairsAt, heightMm }
}

// ── путь 2: раскладка по площадям внутри общего контура здания ──────────────

/**
 * Контур здания — один на все этажи. Иначе этажи получаются разного размера и
 * не складываются в здание: нулевой квадратом, второй вытянутым в кишку.
 * Берём самый большой этаж и делаем прямоугольник с нормальными пропорциями.
 */
export function buildingFootprint(floors: SourceFloor[]): { w: number; h: number } {
  const RATIO = 1.6 // ширина к глубине, обычный офисный корпус
  let maxArea = 0
  for (const f of floors) {
    const bySpaces = f.spaces
      .filter((sp) => sp.kind !== "OBJECT")
      .reduce((sum, sp) => sum + Math.max(0, sp.area), 0)
    maxArea = Math.max(maxArea, bySpaces, f.totalArea ?? 0)
  }
  if (maxArea <= 0) return { w: 0, h: 0 }
  const h = Math.sqrt(maxArea / RATIO)
  return { w: (maxArea / h) * 1000, h: h * 1000 }
}

type Rect = { x: number; y: number; w: number; h: number }
type Cell = { spaceId: string | null; label: string; area: number }

/** Худшее соотношение сторон в ряду — критерий остановки squarified treemap. */
function worstRatio(areas: number[], side: number): number {
  const sum = areas.reduce((a, b) => a + b, 0)
  if (sum <= 0) return Infinity
  const max = Math.max(...areas)
  const min = Math.min(...areas)
  const s2 = sum * sum
  const l2 = side * side
  return Math.max((l2 * max) / s2, s2 / (l2 * min))
}

/**
 * Squarified treemap: режет прямоугольник на ячейки заданной площади так, чтобы
 * они выходили близкими к квадрату, а не к полоскам. Площадь каждой ячейки
 * сохраняется точно — это важно, потому что она равна площади из карточки.
 */
function squarify(cells: Cell[], rect: Rect): { cell: Cell; rect: Rect }[] {
  const out: { cell: Cell; rect: Rect }[] = []
  const total = cells.reduce((sum, c) => sum + c.area, 0)
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) return out

  const scale = (rect.w * rect.h) / total
  const items = cells
    .map((cell) => ({ cell, a: cell.area * scale }))
    .sort((x, y) => y.a - x.a)

  let free: Rect = { ...rect }
  let i = 0
  while (i < items.length) {
    const side = Math.min(free.w, free.h)
    const row = [items[i]]
    i += 1
    while (i < items.length) {
      const withNext = row.concat([items[i]]).map((r) => r.a)
      if (worstRatio(withNext, side) <= worstRatio(row.map((r) => r.a), side)) {
        row.push(items[i])
        i += 1
      } else break
    }

    const rowArea = row.reduce((sum, r) => sum + r.a, 0)
    if (free.w >= free.h) {
      const rw = rowArea / free.h
      let y = free.y
      for (const r of row) {
        const rh = r.a / rw
        out.push({ cell: r.cell, rect: { x: free.x, y, w: rw, h: rh } })
        y += rh
      }
      free = { x: free.x + rw, y: free.y, w: free.w - rw, h: free.h }
    } else {
      const rh = rowArea / free.w
      let x = free.x
      for (const r of row) {
        const rw = r.a / rh
        out.push({ cell: r.cell, rect: { x, y: free.y, w: rw, h: rh } })
        x += rw
      }
      free = { x: free.x, y: free.y + rh, w: free.w, h: free.h - rh }
    }
  }
  return out
}

/**
 * Этаж без плана: делим общий контур здания на комнаты по площадям из карточек.
 * Если помещения не покрывают весь этаж, остаток становится общей зоной —
 * коридорами, лестницами и санузлами, которые в карточках не заведены.
 */
function planFromAreas(spaces: SourceSpace[], footprint: { w: number; h: number }, heightMm: number): PlannedFloor {
  const empty: PlannedFloor = { rooms: [], walls: [], openings: [], stairsAt: [], heightMm }
  if (footprint.w <= 0 || footprint.h <= 0) return empty

  // Помещения-объекты (антенны, камеры) площади не имеют — комнатами не станут.
  // Совсем крошечные записи тоже пропускаем: комната в 1 м² вырождается в щель.
  const MIN_AREA_M2 = 3
  const usable = spaces.filter((sp) => sp.area >= MIN_AREA_M2 && sp.kind !== "OBJECT")
  if (usable.length === 0) return empty

  const footprintM2 = (footprint.w / 1000) * (footprint.h / 1000)
  const cells: Cell[] = usable.map((sp) => ({ spaceId: sp.id, label: sp.number, area: sp.area }))
  // Остаток контура — коридоры, лестницы и санузлы, которых нет в карточках.
  // Мелкий остаток не выделяем: он вырождается в щель вдоль стены. Комнаты тогда
  // растянутся на него, но это доли процента — внутри допуска расхождения.
  const MIN_COMMON_M2 = 5
  const rest = footprintM2 - usable.reduce((sum, sp) => sum + sp.area, 0)
  if (rest > MIN_COMMON_M2) cells.push({ spaceId: null, label: "Общая зона", area: rest })

  // Контур центрируем в начале координат — здание стоит по центру участка.
  const origin: Rect = { x: -footprint.w / 2, y: -footprint.h / 2, w: footprint.w, h: footprint.h }
  const placed = squarify(cells, origin)

  const rooms: PlannedRoom[] = []
  const openings: PlannedFloor["openings"] = []
  const edge = 1 // допуск попадания на границу контура, мм

  for (const { cell, rect } of placed) {
    const x0 = rect.x
    const y0 = rect.y
    const x1 = rect.x + rect.w
    const y1 = rect.y + rect.h
    rooms.push({
      outline: [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ],
      spaceId: cell.spaceId,
      label: cell.label,
    })

    // Дверь — на самой длинной внутренней грани комнаты. Окна здесь не ставим:
    // по одному в центр комнаты они выходят редкими квадратиками вразнобой.
    // Фасад набирается ровным шагом отдельно, см. facadeWindows.
    const sides = [
      { mid: { x: (x0 + x1) / 2, y: y0 }, len: rect.w, outer: Math.abs(y0 - origin.y) < edge },
      { mid: { x: (x0 + x1) / 2, y: y1 }, len: rect.w, outer: Math.abs(y1 - (origin.y + origin.h)) < edge },
      { mid: { x: x0, y: (y0 + y1) / 2 }, len: rect.h, outer: Math.abs(x0 - origin.x) < edge },
      { mid: { x: x1, y: (y0 + y1) / 2 }, len: rect.h, outer: Math.abs(x1 - (origin.x + origin.w)) < edge },
    ]
    const inner = sides.filter((sd) => !sd.outer).sort((a, b) => b.len - a.len)[0]
    if (inner && inner.len > 1200) openings.push({ at: inner.mid, type: "door", width: 900 })
  }

  return { rooms, walls: [], openings, stairsAt: [], heightMm }
}

// ── фасад: окна ровным шагом по наружным стенам ─────────────────────────────

/** Ширина окна, высота, отметка низа и шаг между центрами, мм. */
const WIN = { width: 1800, height: 1600, sill: 800, pitch: 3200, margin: 1400 }

/**
 * Ставит окна по всем наружным стенам этажа с постоянным шагом. Так фасад
 * читается зданием, а не стеной с редкими квадратиками там, где случайно
 * оказался центр комнаты.
 */
function facadeWindows(floor: Floor): Opening[] {
  const out: Opening[] = []
  for (const edge of Object.values(floor.wallGraph.edges)) {
    if (edge.kind !== "exterior") continue
    const a = floor.wallGraph.nodes[edge.a]
    const b = floor.wallGraph.nodes[edge.b]
    if (!a || !b) continue
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    const usable = len - 2 * WIN.margin
    if (usable < WIN.width) continue

    const count = Math.max(1, Math.floor(usable / WIN.pitch) + 1)
    const step = count > 1 ? usable / (count - 1) : 0
    for (let i = 0; i < count; i += 1) {
      const offset = count > 1 ? WIN.margin + step * i : len / 2
      out.push({
        id: uid("op"),
        wallId: edge.id,
        type: "window",
        variant: "standard",
        width: WIN.width,
        height: WIN.height,
        sillHeight: WIN.sill,
        offset,
      })
    }
  }
  return out
}

// ── сборка одного этажа ──────────────────────────────────────────────────────

/**
 * Режет коллинеарные отрезки по всем общим точкам и считает кратность каждого
 * куска. Без этого длинная стена коридора накладывается на короткие стены комнат
 * вместо того, чтобы совпасть с ними: рёбра не склеиваются, контуры не замыкаются
 * и комната не находится. Кратность 1 — наружная стена, 2 и больше — перегородка.
 */
function splitCollinear(segs: { a: Vec2; b: Vec2 }[]): { a: Vec2; b: Vec2; count: number }[] {
  const r = (v: number) => Math.round(v / SNAP_MM) * SNAP_MM
  type Group = {
    dir: Vec2
    origin: Vec2
    items: { t1: number; t2: number }[]
    // Точки разрезов храним как есть: граф склеивает узлы с допуском 1 мм,
    // поэтому пересчитывать координаты из параметра нельзя — углы разъедутся.
    cuts: Map<number, { t: number; p: Vec2 }>
  }
  const groups = new Map<string, Group>()

  for (const s of segs) {
    let dx = s.b.x - s.a.x
    let dy = s.b.y - s.a.y
    const len = Math.hypot(dx, dy)
    if (len < SNAP_MM) continue
    dx /= len
    dy /= len
    // Одна прямая — одно направление: разворачиваем к каноническому.
    if (dx < -1e-9 || (Math.abs(dx) <= 1e-9 && dy < 0)) {
      dx = -dx
      dy = -dy
    }
    const offset = dx * s.a.y - dy * s.a.x // знаковое расстояние до начала координат
    const gk = `${dx.toFixed(4)},${dy.toFixed(4)}|${r(offset)}`
    let g = groups.get(gk)
    if (!g) {
      g = { dir: { x: dx, y: dy }, origin: s.a, items: [], cuts: new Map() }
      groups.set(gk, g)
    }
    const proj = (p: Vec2) => (p.x - g!.origin.x) * g!.dir.x + (p.y - g!.origin.y) * g!.dir.y
    const ta = proj(s.a)
    const tb = proj(s.b)
    g.items.push({ t1: Math.min(ta, tb), t2: Math.max(ta, tb) })
    for (const [t, p] of [[ta, s.a], [tb, s.b]] as const) {
      const k = r(t)
      if (!g.cuts.has(k)) g.cuts.set(k, { t, p })
    }
  }

  const out: { a: Vec2; b: Vec2; count: number }[] = []
  for (const g of groups.values()) {
    const cuts = [...g.cuts.values()].sort((x, y) => x.t - y.t)
    for (let i = 0; i < cuts.length - 1; i++) {
      const lo = cuts[i]
      const hi = cuts[i + 1]
      if (hi.t - lo.t < SNAP_MM) continue
      const mid = (lo.t + hi.t) / 2
      const count = g.items.filter((it) => it.t1 <= mid && mid <= it.t2).length
      if (count === 0) continue
      out.push({ a: lo.p, b: hi.p, count })
    }
  }
  return out
}

function wallCommands(floorId: string, plan: PlannedFloor): Command[] {
  // Все рёбра контуров комнат. Отрезок, принадлежащий одной комнате, — наружная
  // стена; общий для двух — перегородка.
  const raw: { a: Vec2; b: Vec2 }[] = []
  for (const room of plan.rooms) {
    const n = room.outline.length
    for (let i = 0; i < n; i++) raw.push({ a: room.outline[i], b: room.outline[(i + 1) % n] })
  }

  const cmds: Command[] = []
  // Наружные первыми: периметр задаёт каркас, перегородки режутся об него.
  const segs = splitCollinear(raw).sort((s1, s2) => s1.count - s2.count)
  for (const s of segs) {
    const def = s.count === 1 ? { ...EXT, height: plan.heightMm } : { ...INT, height: plan.heightMm }
    cmds.push(new InsertWallCommand(floorId, s.a, s.b, def))
  }
  // Явные стены из плана — всегда перегородки.
  for (const w of plan.walls) {
    cmds.push(new InsertWallCommand(floorId, w.a, w.b, { thickness: w.thickness, height: plan.heightMm, kind: "partition" }))
  }
  return cmds
}

/** Ищет ребро графа, к которому относится проём, и возвращает смещение вдоль него. */
function snapOpening(
  floor: Floor,
  at: Vec2,
): { wallId: string; offset: number } | null {
  let best: { wallId: string; offset: number; dist: number } | null = null
  for (const edge of Object.values(floor.wallGraph.edges)) {
    const na = floor.wallGraph.nodes[edge.a]
    const nb = floor.wallGraph.nodes[edge.b]
    if (!na || !nb) continue
    const res = closestOnSegment(at, na, nb)
    const len = Math.hypot(nb.x - na.x, nb.y - na.y)
    if (len < 1) continue
    if (!best || res.dist < best.dist) best = { wallId: edge.id, offset: res.t * len, dist: res.dist }
  }
  if (!best || best.dist > OPENING_SNAP_MM) return null
  return { wallId: best.wallId, offset: best.offset }
}

// ── главная функция ──────────────────────────────────────────────────────────

export function buildProjectFromBuilding(src: SourceBuilding): BuildFromBuildingResult {
  const report: BuildReport = {
    floorsExact: 0,
    floorsApprox: 0,
    floorsSkipped: [],
    roomsLinked: 0,
    spacesUnlinked: [],
    mismatches: [],
  }

  const building: Building = { id: uid("b"), name: src.name, origin: { x: 0, y: 0 }, floors: [], sections: [] }
  let doc: BuilderDocument = {
    id: uid("proj"),
    schemaVersion: 1,
    name: src.name,
    site: { sizeX: 80000, sizeZ: 60000, groundMaterialId: "grass", objects: [], terrainRes: 64, water: [], paths: [], pavements: [] },
    buildings: [],
  }
  const run = (cmd: Command) => {
    doc = cmd.apply(doc)
  }
  run(new AddBuildingCommand(building))

  // Территория — это двор и парковка, крыша — площадка под антенны и камеры.
  // Ни то, ни другое не является этажом с комнатами.
  const OUTSIDE = new Set(["TERRITORY", "ROOF"])
  const floors = src.floors.filter((f) => !OUTSIDE.has(f.kind)).sort((a, b) => a.number - b.number)
  for (const f of src.floors) {
    if (OUTSIDE.has(f.kind)) report.floorsSkipped.push(f.name)
  }

  // Отметка пола накапливается от нулевого уровня: надземные этажи вверх,
  // подземные вниз. Высота у этажей бывает разной, поэтому не умножаем на номер.
  const planned: { source: SourceFloor; plan: PlannedFloor; floorId: string; exact: boolean }[] = []
  const firstAbove = floors.findIndex((f) => f.number >= 0)
  const belowCount = firstAbove === -1 ? floors.length : firstAbove
  const elevations = new Map<string, number>()
  let up = 0
  for (let i = belowCount; i < floors.length; i++) {
    const f = floors[i]
    elevations.set(f.id, up)
    up += planHeight(f)
  }
  let down = 0
  for (let i = belowCount - 1; i >= 0; i--) {
    const f = floors[i]
    down -= planHeight(f)
    elevations.set(f.id, down)
  }
  // Этаж 0 под надземными — цокольный: уходит в землю, 1 этаж начинается с
  // уровня земли (так решил владелец для своих зданий; точную отметку задают
  // в панели этажа).
  const plinth = floors.find((f) => f.number === 0)
  if (plinth && floors.some((f) => f.number >= 1)) {
    const offset = -planHeight(plinth)
    for (const [id, value] of elevations) elevations.set(id, value + offset)
  }

  const footprint = buildingFootprint(floors)

  for (const f of floors) {
    // План может существовать, но быть пустым — в проде это обычный случай:
    // холст создан, комнаты не нарисованы. Тогда идём по площадям.
    const parsed = parseLayout(f.layoutJson)
    const fromLayout = parsed ? planFromLayout(parsed) : null
    const exact = !!fromLayout && fromLayout.rooms.length > 0
    const plan = exact ? fromLayout! : planFromAreas(f.spaces, footprint, planHeight(f))
    if (plan.rooms.length === 0) {
      report.floorsSkipped.push(f.name)
      continue
    }
    if (exact) report.floorsExact += 1
    else report.floorsApprox += 1

    const floorId = uid("f")
    const floor: Floor = {
      id: floorId,
      name: f.name,
      level: f.number,
      elevation: elevations.get(f.id) ?? 0,
      height: plan.heightMm,
      visible: true,
      locked: false,
      opacity: 1,
      wallGraph: emptyGraph(),
      openings: [],
      stairs: [],
      objects: [],
      premiseLinks: {},
      floorMaterialId: "laminate",
      roomMaterials: {},
      mepRuns: [],
      mepDevices: [],
      sourceFloorId: f.id,
    }
    run(new AddFloorCommand(building.id, floor))
    for (const cmd of wallCommands(floorId, plan)) run(cmd)
    planned.push({ source: f, plan, floorId, exact })
  }

  // ── проёмы, привязки помещений и расхождения площадей ──────────────────────
  const areaBySpaceId = new Map<string, { number: string; area: number }>()
  for (const f of src.floors) for (const s of f.spaces) areaBySpaceId.set(s.id, { number: s.number, area: s.area })
  const linkedSpaceIds = new Set<string>()

  for (const { plan, floorId, exact } of planned) {
    const built = doc.buildings[0].floors.find((fl) => fl.id === floorId)
    if (!built) continue

    // У этажа с нарисованным планом окна свои — из плана. У разложенного по
    // площадям окон нет вовсе, поэтому набираем фасад ровным шагом.
    if (!exact) {
      for (const win of facadeWindows(built)) run(new AddOpeningCommand(floorId, win))
    }

    for (const op of plan.openings) {
      const snap = snapOpening(built, op.at)
      if (!snap) continue
      const opening: Opening =
        op.type === "door"
          ? { id: uid("op"), wallId: snap.wallId, type: "door", variant: "single", width: op.width, height: 2100, sillHeight: 0, offset: snap.offset }
          : { id: uid("op"), wallId: snap.wallId, type: "window", variant: "standard", width: op.width, height: 1400, sillHeight: 900, offset: snap.offset }
      run(new AddOpeningCommand(floorId, opening))
    }

    // Комнаты — производные от графа стен, поэтому их id известен только после
    // построения. Прогоняем настоящий detectRooms и сопоставляем по центроиду.
    const rooms = detectRooms(built.wallGraph)
    for (const room of rooms) {
      const c = centroid(room.polygon)
      const match = plan.rooms.find((r) => r.spaceId && pointInPolygon(c, r.outline))
      if (!match || !match.spaceId) continue
      run(new LinkPremiseCommand(floorId, room.id, match.spaceId))
      report.roomsLinked += 1
      linkedSpaceIds.add(match.spaceId)

      const card = areaBySpaceId.get(match.spaceId)
      if (card && card.area > 0) {
        const modelM2 = polygonAreaMm2(room.polygon) / 1_000_000
        const diff = Math.abs(modelM2 - card.area) / card.area
        if (diff > MISMATCH_TOLERANCE) {
          report.mismatches.push({
            spaceNumber: card.number,
            cardM2: Math.round(card.area * 10) / 10,
            modelM2: Math.round(modelM2 * 10) / 10,
          })
        }
      }
    }
  }

  for (const [id, card] of areaBySpaceId) {
    if (!linkedSpaceIds.has(id)) report.spacesUnlinked.push(card.number)
  }

  // ── крыша на верхнем этаже ────────────────────────────────────────────────
  // Без неё сверху видно голое перекрытие: здание выглядит недостроенным.
  const top = planned[planned.length - 1]
  if (top) {
    run(
      new SetRoofCommand(top.floorId, {
        type: "flat",
        pitchDeg: 0,
        overhang: 400,
        thickness: 250,
        materialId: "concrete",
      }),
    )
  }

  // ── лестницы между соседними этажами ──────────────────────────────────────
  for (let i = 0; i < planned.length - 1; i++) {
    const cur = planned[i]
    const next = planned[i + 1]
    const at = cur.plan.stairsAt[0]
    if (!at) continue
    const stair: Stair = {
      id: uid("st"),
      shape: "straight",
      fromFloorId: cur.floorId,
      toFloorId: next.floorId,
      position: at,
      rotationDeg: 0,
      width: 1200,
      railing: true,
    }
    run(new AddStairCommand(cur.floorId, stair))
  }

  return { doc, report }
}

function planHeight(f: SourceFloor): number {
  const parsed = parseLayout(f.layoutJson)
  if (parsed?.ceilingHeight) return Math.round(parsed.ceilingHeight * 1000)
  return DEFAULT_FLOOR_HEIGHT
}

function parseLayout(raw: string | null): FloorLayoutV2 | null {
  if (!raw) return null
  try {
    const obj = JSON.parse(raw)
    return isLayoutV2(obj) ? obj : null
  } catch {
    return null
  }
}
