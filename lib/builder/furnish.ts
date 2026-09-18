// Автоматическая обстановка помещений для 3D: столы, кресла, стеллажи и свет
// расставляются по назначению помещения. Это только вид — в документ ничего не
// пишется, на планах и в БТИ этой мебели нет. Расчёт детерминированный (сетка,
// без случайностей), иначе при каждой пересборке сцена «дёргалась» бы.

import type { Floor, Opening, Stair } from "@/types/builder"
import type { Vec2 } from "@/core/geometry/math"
import { pointInPolygon } from "@/core/geometry/math"
import { ASSET_SIZES } from "./asset-sizes"
import type { FloorRoom } from "./rooms"
import { roomDisplayName, roomUse } from "./room-use"

export interface FurnishItem {
  id: string
  assetId: string
  /** центр в координатах этажа, мм */
  at: Vec2
  /** сдвиг точки установки по высоте от пола, мм (у светильников — до потолка) */
  y: number
  rotationY: number
  scale: number
}

/** Чем занято помещение — от этого зависит набор мебели. */
export type FurnishKind = "office" | "lobby" | "retail" | "cafe" | "meeting" | "tech" | "none"

const RETAIL = /магазин|торг|бутик|салон|шоурум|аптек/i
const CAFE = /кафе|ресторан|столов|бар|кофе|пекарн|фуд/i
const MEET = /переговор|совещан|конференц/i
const LOBBY = /холл|фойе|вестибюл|ресепш|приём|входная|тамбур/i
const SKIP = /санузел|туалет|уборн|душ|кладов|лестни|лифт|шахта|венткамер/i

/** Назначение обстановки по типу помещения и его наименованию. */
export function furnishKind(floor: Pick<Floor, "roomUse" | "roomNames" | "stairs" | "wallGraph" | "height">, room: FloorRoom): FurnishKind {
  const name = roomDisplayName(floor as Parameters<typeof roomDisplayName>[0], room)
  if (SKIP.test(name)) return "none"
  const use = roomUse(floor as Parameters<typeof roomUse>[0], room)
  if (use === "tech") return "tech"
  if (RETAIL.test(name)) return "retail"
  if (CAFE.test(name)) return "cafe"
  if (MEET.test(name)) return "meeting"
  if (use === "common") return LOBBY.test(name) || room.areaMm2 > 25e6 ? "lobby" : "none"
  if (LOBBY.test(name)) return "lobby"
  return "office"
}

function bbox(poly: Vec2[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of poly) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

function rectCorners(c: Vec2, w: number, d: number, rot: number): Vec2[] {
  const cos = Math.cos(rot), sin = Math.sin(rot)
  const hw = w / 2, hd = d / 2
  return [
    { x: hw, y: hd }, { x: -hw, y: hd }, { x: -hw, y: -hd }, { x: hw, y: -hd },
  ].map((p) => ({ x: c.x + p.x * cos - p.y * sin, y: c.y + p.x * sin + p.y * cos }))
}

/** Прямоугольник целиком внутри помещения (и не в «острове» вроде санузла)? */
function insideRoom(room: FloorRoom, c: Vec2, w: number, d: number, rot: number): boolean {
  const pts = [c, ...rectCorners(c, w, d, rot)]
  for (const p of pts) {
    if (!pointInPolygon(p, room.polygon)) return false
    for (const h of room.holes ?? []) if (pointInPolygon(p, h)) return false
  }
  return true
}

/** Габарит объекта каталога с учётом масштаба. */
function size(assetId: string, scale: number): { w: number; d: number } {
  const s = ASSET_SIZES[assetId] ?? { w: 800, d: 800, h: 800 }
  return { w: s.w * scale, d: s.d * scale }
}

/** Занятые места: уже расставленная мебель, лестницы, лифты и колонны. */
interface Blocker { c: Vec2; w: number; d: number }

function stairBlocker(s: Stair): Blocker {
  const w = s.width || 1100
  const d = s.shape === "column" ? (s.depth ?? w) : s.shape === "elevator" ? 2200 : (s.tread ?? 280) * 14
  return { c: { x: s.position.x, y: s.position.y }, w: w + 400, d: d + 400 }
}

function hits(b: Blocker, c: Vec2, w: number, d: number): boolean {
  return Math.abs(b.c.x - c.x) < (b.w + w) / 2 && Math.abs(b.c.y - c.y) < (b.d + d) / 2
}

/**
 * Точки перед дверями, которые нельзя загораживать: проход шириной 1,2 м вглубь
 * помещения. Иначе шкаф вставал ровно в дверном проёме.
 */
export function doorBlockers(floor: Pick<Floor, "wallGraph" | "openings">): Blocker[] {
  const out: Blocker[] = []
  for (const o of floor.openings as Opening[]) {
    if (o.type !== "door") continue
    const e = floor.wallGraph.edges[o.wallId]
    if (!e) continue
    const a = floor.wallGraph.nodes[e.a], b = floor.wallGraph.nodes[e.b]
    if (!a || !b) continue
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const t = Math.min(1, Math.max(0, o.offset / len))
    const c = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    out.push({ c, w: Math.max(1600, o.width + 600), d: Math.max(1600, o.width + 600) })
  }
  return out
}

/** Набор мебели для одного «места» — стол со стулом ставится парой. */
interface Slot {
  items: Array<{ assetId: string; dx: number; dy: number; rot: number; scale: number }>
  /** шаг сетки по X и Y, мм */
  stepX: number
  stepY: number
  /** габарит места целиком */
  w: number
  d: number
}

function slotFor(kind: FurnishKind): Slot | null {
  switch (kind) {
    case "office":
      return {
        items: [
          { assetId: "office_desk", dx: 0, dy: 0, rot: 0, scale: 1 },
          { assetId: "chair", dx: 0, dy: 900, rot: Math.PI, scale: 1 },
          // модель монитора общая с телевизором — уменьшаем до настольной
          { assetId: "monitor", dx: 0, dy: -350, rot: 0, scale: 0.5 },
        ],
        stepX: 2200, stepY: 2600, w: 1600, d: 2000,
      }
    case "meeting":
      return {
        items: [
          { assetId: "meeting_table", dx: 0, dy: 0, rot: 0, scale: 1 },
          { assetId: "chair", dx: -1100, dy: 0, rot: Math.PI / 2, scale: 1 },
          { assetId: "chair", dx: 1100, dy: 0, rot: -Math.PI / 2, scale: 1 },
        ],
        stepX: 3600, stepY: 3200, w: 3000, d: 2200,
      }
    case "retail":
      return {
        items: [
          { assetId: "rack", dx: 0, dy: 0, rot: 0, scale: 1 },
          { assetId: "display_case", dx: 0, dy: 1400, rot: 0, scale: 1 },
        ],
        stepX: 2400, stepY: 3200, w: 1400, d: 2600,
      }
    case "cafe":
      return {
        items: [
          { assetId: "cafe_table", dx: 0, dy: 0, rot: 0, scale: 1 },
          { assetId: "cafe_chair", dx: -700, dy: 0, rot: Math.PI / 2, scale: 1 },
          { assetId: "cafe_chair", dx: 700, dy: 0, rot: -Math.PI / 2, scale: 1 },
        ],
        stepX: 2400, stepY: 2400, w: 2000, d: 1000,
      }
    case "lobby":
      return {
        items: [
          { assetId: "sofa", dx: 0, dy: 0, rot: 0, scale: 1 },
          { assetId: "coffee_table", dx: 0, dy: 1200, rot: 0, scale: 1 },
          { assetId: "armchair", dx: 0, dy: 2400, rot: Math.PI, scale: 1 },
        ],
        stepX: 4200, stepY: 4600, w: 2200, d: 3400,
      }
    case "tech":
      return { items: [{ assetId: "rack", dx: 0, dy: 0, rot: 0, scale: 1 }], stepX: 2000, stepY: 2400, w: 1200, d: 800 }
    default:
      return null
  }
}

/** Сколько мест максимум ставим в одно помещение — чтобы не утопить сцену. */
const MAX_SLOTS = 24
/** Шаг потолочных светильников, мм. */
const LIGHT_STEP = 3000
/** На какой высоте висит светильник в модели каталога, мм. */
const LIGHT_MODEL_Y = 2850

/**
 * Обстановка помещения: мебель по сетке внутри контура, светильники под потолком.
 * `blockers` — лестницы, колонны и двери, вокруг которых оставляем проход.
 */
export function furnishRoom(
  room: FloorRoom,
  kind: FurnishKind,
  floorHeight: number,
  blockers: Blocker[] = [],
): FurnishItem[] {
  const out: FurnishItem[] = []
  if (room.polygon.length < 3 || room.areaMm2 < 4e6) return out
  const box = bbox(room.polygon)
  const slot = slotFor(kind)
  const taken: Blocker[] = [...blockers]
  if (slot) {
    const cols = Math.max(1, Math.floor((box.maxX - box.minX) / slot.stepX))
    const rows = Math.max(1, Math.floor((box.maxY - box.minY) / slot.stepY))
    const offX = (box.maxX - box.minX - (cols - 1) * slot.stepX) / 2
    const offY = (box.maxY - box.minY - (rows - 1) * slot.stepY) / 2
    let n = 0
    for (let j = 0; j < rows && n < MAX_SLOTS; j++) {
      for (let i = 0; i < cols && n < MAX_SLOTS; i++) {
        const c = { x: box.minX + offX + i * slot.stepX, y: box.minY + offY + j * slot.stepY }
        if (!insideRoom(room, c, slot.w, slot.d, 0)) continue
        if (taken.some((b) => hits(b, c, slot.w, slot.d))) continue
        taken.push({ c, w: slot.w, d: slot.d })
        n++
        for (const it of slot.items) {
          const at = { x: c.x + it.dx, y: c.y + it.dy }
          const s = size(it.assetId, it.scale)
          if (!insideRoom(room, at, s.w, s.d, it.rot)) continue
          out.push({ id: `${room.id}_${i}_${j}_${it.assetId}_${out.length}`, assetId: it.assetId, at, y: 0, rotationY: it.rot, scale: it.scale })
        }
      }
    }
  }
  // растение в свободном углу: помещение перестаёт выглядеть складом мебели
  if (kind === "office" || kind === "lobby" || kind === "meeting") {
    const inset = 900
    const corners = [
      { x: box.minX + inset, y: box.minY + inset },
      { x: box.maxX - inset, y: box.minY + inset },
      { x: box.maxX - inset, y: box.maxY - inset },
      { x: box.minX + inset, y: box.maxY - inset },
    ]
    for (const c of corners) {
      if (!insideRoom(room, c, 1000, 1000, 0)) continue
      if (taken.some((b) => hits(b, c, 1000, 1000))) continue
      taken.push({ c, w: 1000, d: 1000 })
      out.push({ id: `${room.id}_plant`, assetId: "plant_pot", at: c, y: 0, rotationY: 0, scale: 1 })
      break
    }
  }
  // светильники под потолком — ровной сеткой, как в офисах с подвесным потолком
  const lw = Math.max(1, Math.round((box.maxX - box.minX) / LIGHT_STEP))
  const lh = Math.max(1, Math.round((box.maxY - box.minY) / LIGHT_STEP))
  for (let j = 0; j < lh; j++) {
    for (let i = 0; i < lw; i++) {
      const c = {
        x: box.minX + ((box.maxX - box.minX) * (i + 0.5)) / lw,
        y: box.minY + ((box.maxY - box.minY) * (j + 0.5)) / lh,
      }
      if (!insideRoom(room, c, 600, 600, 0)) continue
      // модель светильника уже висит на 2,85 м над своей точкой: поднимаем её
      // на разницу высот, иначе на низких этажах лампа пробивает перекрытие
      out.push({ id: `${room.id}_l${i}_${j}`, assetId: "ceiling_light", at: c, y: Math.round(Math.max(-400, floorHeight - LIGHT_MODEL_Y - 150)), rotationY: 0, scale: 1 })
    }
  }
  return out
}

/** Обстановка всего этажа. Помещения-исключения (санузлы, лестницы) пропускаются. */
export function furnishFloor(floor: Floor, rooms: FloorRoom[]): FurnishItem[] {
  const base: Blocker[] = [
    ...(floor.stairs ?? []).map(stairBlocker),
    ...doorBlockers(floor),
    ...(floor.objects ?? []).map((o) => {
      const s = size(o.assetId, o.scale ?? 1)
      return { c: { x: o.position.x, y: o.position.z }, w: s.w + 300, d: s.d + 300 }
    }),
  ]
  const out: FurnishItem[] = []
  for (const room of rooms) {
    const kind = furnishKind(floor, room)
    if (kind === "none" && room.areaMm2 < 8e6) continue
    out.push(...furnishRoom(room, kind, floor.height, base))
  }
  return out
}
