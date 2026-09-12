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
//   2. Плана нет, есть только помещения с площадями — приблизительная раскладка
//      вдоль коридора. Грубо, но человеку есть что двигать.

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
  const toMm = (x: number, y: number): Vec2 => ({ x: (x - cx) * 1000, y: (y - cy) * 1000 })

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

// ── путь 2: приблизительная раскладка по площадям ────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * Плана нет — раскладываем помещения по площадям. Площадь каждой комнаты
 * совпадает с карточкой: глубина ряда фиксирована, ширина выводится из площади.
 * Это заготовка под ручную правку, а не проект.
 *
 * Одна комната — делаем её примерно квадратной. Много комнат — два ряда вдоль
 * центрального коридора, как на обычном офисном этаже.
 */
function planFromAreas(spaces: SourceSpace[], heightMm: number): PlannedFloor {
  const CORRIDOR_M = 2.5
  const MIN_W_M = 2.5

  // Помещения-объекты (антенны на крыше, камеры на фасаде) площади не имеют —
  // комнатами они не являются. Совсем крошечные записи тоже пропускаем: комната
  // в 1 м² выродится в щель, а если её растянуть до минимума, площадь в модели
  // разойдётся с карточкой в десятки раз. Такие привязываются руками.
  const MIN_AREA_M2 = 3
  const usable = spaces.filter((s) => s.area >= MIN_AREA_M2 && s.kind !== "OBJECT")
  const empty: PlannedFloor = { rooms: [], walls: [], openings: [], stairsAt: [], heightMm }
  if (usable.length === 0) return empty

  const rooms: PlannedRoom[] = []
  const openings: PlannedFloor["openings"] = []

  // Одно помещение на весь этаж — просто прямоугольник, близкий к квадрату.
  if (usable.length === 1) {
    const s = usable[0]
    const side = Math.sqrt(s.area)
    const hw = (side / 2) * 1000
    const hh = (s.area / side / 2) * 1000
    rooms.push({
      outline: [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
      ],
      spaceId: s.id,
      label: s.number,
    })
    openings.push({ at: { x: 0, y: hh }, type: "door", width: 1000 })
    return { rooms, walls: [], openings, stairsAt: [], heightMm }
  }

  const total = usable.reduce((sum, s) => sum + s.area, 0)
  const depthM = clamp(Math.sqrt((total / usable.length) * 1.3), 4, 14)

  // Раскидываем по двум рядам, добирая в тот, что сейчас короче, — так ряды
  // получаются примерно одной длины и этаж не вытягивается в кишку.
  const top: SourceSpace[] = []
  const bottom: SourceSpace[] = []
  let topW = 0
  let bottomW = 0
  const widthOf = (s: SourceSpace) => Math.max(MIN_W_M, s.area / depthM)
  for (const s of [...usable].sort((a, b) => b.area - a.area)) {
    const w = widthOf(s)
    if (topW <= bottomW) {
      top.push(s)
      topW += w
    } else {
      bottom.push(s)
      bottomW += w
    }
  }

  const rowW = Math.max(topW, bottomW)
  const halfRow = (rowW / 2) * 1000
  const depth = depthM * 1000
  const corridor = CORRIDOR_M * 1000
  const topY = -(depth + corridor / 2)
  const corridorTop = topY + depth
  const corridorBottom = corridorTop + corridor

  const layRow = (row: SourceSpace[], y0: number, doorAtTop: boolean) => {
    let x = -halfRow
    for (const s of row) {
      const w = widthOf(s) * 1000
      rooms.push({
        outline: [
          { x, y: y0 },
          { x: x + w, y: y0 },
          { x: x + w, y: y0 + depth },
          { x, y: y0 + depth },
        ],
        spaceId: s.id,
        label: s.number,
      })
      // Дверь в коридор: у верхнего ряда снизу, у нижнего сверху.
      openings.push({ at: { x: x + w / 2, y: doorAtTop ? y0 : y0 + depth }, type: "door", width: 900 })
      x += w
    }
  }
  layRow(top, topY, false)
  layRow(bottom, corridorBottom, true)

  // Коридор между рядами.
  rooms.push({
    outline: [
      { x: -halfRow, y: corridorTop },
      { x: halfRow, y: corridorTop },
      { x: halfRow, y: corridorBottom },
      { x: -halfRow, y: corridorBottom },
    ],
    spaceId: null,
    label: "Коридор",
  })

  return { rooms, walls: [], openings, stairsAt: [], heightMm }
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

  const building: Building = { id: uid("b"), name: src.name, origin: { x: 0, y: 0 }, floors: [] }
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
  const planned: { source: SourceFloor; plan: PlannedFloor; floorId: string }[] = []
  const firstAbove = floors.findIndex((f) => f.number >= 1)
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

  for (const f of floors) {
    // План может существовать, но быть пустым — в проде это обычный случай:
    // холст создан, комнаты не нарисованы. Тогда идём по площадям.
    const parsed = parseLayout(f.layoutJson)
    const fromLayout = parsed ? planFromLayout(parsed) : null
    const exact = !!fromLayout && fromLayout.rooms.length > 0
    const plan = exact ? fromLayout! : planFromAreas(f.spaces, planHeight(f))
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
    }
    run(new AddFloorCommand(building.id, floor))
    for (const cmd of wallCommands(floorId, plan)) run(cmd)
    planned.push({ source: f, plan, floorId })
  }

  // ── проёмы, привязки помещений и расхождения площадей ──────────────────────
  const areaBySpaceId = new Map<string, { number: string; area: number }>()
  for (const f of src.floors) for (const s of f.spaces) areaBySpaceId.set(s.id, { number: s.number, area: s.area })
  const linkedSpaceIds = new Set<string>()

  for (const { plan, floorId } of planned) {
    const built = doc.buildings[0].floors.find((fl) => fl.id === floorId)
    if (!built) continue

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
