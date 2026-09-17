// Ведомость отделки помещений и экспликация полов (ГОСТ 21.501, формы 1 и 2).
// Всё выводится из модели: пол — материал помещения, стены — материал стен,
// ограждающих помещение, площади — из контура помещения и высоты этажа.

import type { Floor } from "@/types/builder"
import { floorRooms, type FloorRoom } from "@/lib/builder/rooms"
import { roomDisplayName, roomUse } from "@/lib/builder/room-use"
import { MATERIALS } from "@/lib/builder/materials"
import { pointInPolygon, type Vec2 } from "@/core/geometry/math"

export interface FinishRow {
  roomId: string
  number: string
  name: string
  /** пол */
  floor: string
  /** стены */
  walls: string
  /** потолок */
  ceiling: string
  /** площадь пола, м² */
  floorM2: number
  /** площадь стен за вычетом проёмов, м² */
  wallsM2: number
  /** площадь потолка, м² */
  ceilingM2: number
}

const DEFAULT_CEILING = "Окраска водоэмульсионная"
const DEFAULT_WALLS = "Штукатурка, окраска"

function materialName(id: string | undefined, fallback: string): string {
  return id && MATERIALS[id] ? MATERIALS[id].name : fallback
}

/** Стены, ограждающие помещение: их середина лежит на контуре помещения. */
function roomWalls(floor: Floor, room: FloorRoom): string[] {
  const g = floor.wallGraph
  const ids: string[] = []
  for (const id in g.edges) {
    const e = g.edges[id]
    const a = g.nodes[e.a], b = g.nodes[e.b]
    if (!a || !b) continue
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L }
    const probe = e.thickness / 2 + 200
    const inside = (p: Vec2) => pointInPolygon(p, room.polygon) && !(room.holes ?? []).some((h) => pointInPolygon(p, h))
    if (inside({ x: mid.x + n.x * probe, y: mid.y + n.y * probe }) || inside({ x: mid.x - n.x * probe, y: mid.y - n.y * probe })) ids.push(id)
  }
  return ids
}

function perimeter(poly: Vec2[]): number {
  let p = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    p += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return p
}

/**
 * Ведомость отделки. numbers — номера помещений из экспликации (чтобы таблицы
 * совпадали), иначе берётся порядковый номер.
 */
export function finishSchedule(floor: Floor, numbers: Map<string, string> = new Map()): FinishRow[] {
  const rooms = floorRooms(floor)
  return rooms.map((r, i) => {
    const walls = roomWalls(floor, r)
    const wallMats = walls.map((id) => floor.wallGraph.edges[id]?.interiorMaterialId).filter(Boolean) as string[]
    const common = wallMats.sort((a, b) => wallMats.filter((x) => x === b).length - wallMats.filter((x) => x === a).length)[0]
    const openArea = floor.openings
      .filter((o) => walls.includes(o.wallId))
      .reduce((s, o) => s + (o.width * o.height) / 1e6, 0)
    const per = perimeter(r.polygon) / 1000
    const wallsM2 = Math.max(0, per * (floor.height / 1000) - openArea / 2)
    const area = r.areaMm2 / 1e6
    const r1 = (v: number) => Math.round(v * 10) / 10
    const use = roomUse(floor, r)
    return {
      roomId: r.id,
      number: numbers.get(r.id) ?? (use === "rent" ? String(i + 1) : ""),
      name: roomDisplayName(floor, r) || "Помещение",
      floor: materialName(floor.roomMaterials?.[r.id] ?? floor.floorMaterialId, "Керамогранит"),
      walls: materialName(common, DEFAULT_WALLS),
      ceiling: DEFAULT_CEILING,
      floorM2: r1(area),
      wallsM2: r1(wallsM2),
      ceilingM2: r1(area),
    }
  })
}

export interface FloorTypeRow {
  /** тип пола: 1, 2, 3… */
  type: number
  /** материал покрытия */
  covering: string
  /** состав конструкции пола */
  layers: string
  /** номера помещений */
  rooms: string
  /** суммарная площадь, м² */
  areaM2: number
}

const LAYERS: Record<string, string> = {
  tile: "Керамическая плитка 8 мм; клей 5 мм; стяжка ЦПС 40 мм; плита перекрытия",
  granite: "Керамогранит 10 мм; клей 5 мм; стяжка ЦПС 40 мм; плита перекрытия",
  laminate: "Ламинат 8 мм; подложка 3 мм; стяжка ЦПС 40 мм; плита перекрытия",
  parquet: "Паркет 15 мм; фанера 12 мм; стяжка ЦПС 40 мм; плита перекрытия",
  carpet: "Ковролин 8 мм; стяжка ЦПС 40 мм; плита перекрытия",
  concrete: "Бетон В22,5 с упрочнением 60 мм; плита перекрытия",
  epoxy: "Наливное покрытие 3 мм; грунт; стяжка ЦПС 40 мм; плита перекрытия",
}

function layersFor(materialId: string): string {
  const id = materialId.toLowerCase()
  for (const key in LAYERS) if (id.includes(key)) return LAYERS[key]
  if (id.includes("marble") || id.includes("terrazzo")) return LAYERS.granite
  if (id.includes("wood") || id.includes("oak") || id.includes("ash") || id.includes("walnut") || id.includes("wenge")) return LAYERS.parquet
  if (id.includes("vinyl")) return LAYERS.laminate
  return LAYERS.concrete
}

/** Экспликация полов: типы полов по материалам с составом конструкции. */
export function floorTypes(floor: Floor, numbers: Map<string, string> = new Map()): FloorTypeRow[] {
  const rooms = floorRooms(floor)
  const byMaterial = new Map<string, { rooms: string[]; area: number }>()
  for (const r of rooms) {
    const id = floor.roomMaterials?.[r.id] ?? floor.floorMaterialId ?? "granite_beige"
    const cur = byMaterial.get(id) ?? { rooms: [], area: 0 }
    const num = numbers.get(r.id)
    if (num) cur.rooms.push(num)
    cur.area += r.areaMm2 / 1e6
    byMaterial.set(id, cur)
  }
  return [...byMaterial.entries()].map(([id, v], i) => ({
    type: i + 1,
    covering: materialName(id, "Керамогранит"),
    layers: layersFor(id),
    rooms: v.rooms.join(", "),
    areaM2: Math.round(v.area * 10) / 10,
  }))
}
