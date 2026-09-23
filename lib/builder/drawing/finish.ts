// Ведомость отделки помещений и экспликация полов (ГОСТ 21.501, формы 1 и 2).
// Всё выводится из модели: пол — материал помещения, стены — материал стен,
// ограждающих помещение, площади — из контура помещения и высоты этажа.

import type { Floor } from "@/types/builder"
import { floorRooms, type FloorRoom } from "@/lib/builder/rooms"
import { roomDisplayName, roomUse } from "@/lib/builder/room-use"
import { MATERIALS, materialNameKey } from "@/lib/builder/materials"
import type { SheetT } from "@/lib/builder/sheet-text"
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

function materialName(t: SheetT, id: string | undefined, fallback: "granite"): string {
  return t(`adminBuilder.materials.${id && MATERIALS[id] ? materialNameKey(id) : fallback}`)
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
export function finishSchedule(floor: Floor, t: SheetT, numbers: Map<string, string> = new Map()): FinishRow[] {
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
      name: roomDisplayName(floor, r, (key) => t(`adminBuilder.roomNames.${key}`)) || t("adminBuilderSheet.sheet.roomFallback"),
      floor: materialName(t, floor.roomMaterials?.[r.id] ?? floor.floorMaterialId, "granite"),
      walls: common && MATERIALS[common] ? materialName(t, common, "granite") : t("adminBuilderSheet.sheetText.finishWalls"),
      ceiling: t("adminBuilderSheet.sheetText.finishCeiling"),
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

// Состав конструкции пола по материалу покрытия: ключ словаря
// (adminBuilderSheet.sheetText.layers*), подставляется при печати листа.
const LAYER_KEYS = ["tile", "granite", "laminate", "parquet", "carpet", "concrete", "epoxy"] as const
type LayerKey = (typeof LAYER_KEYS)[number]

const LAYER_TEXT: Record<LayerKey, "layersTile" | "layersGranite" | "layersLaminate" | "layersParquet" | "layersCarpet" | "layersConcrete" | "layersEpoxy"> = {
  tile: "layersTile",
  granite: "layersGranite",
  laminate: "layersLaminate",
  parquet: "layersParquet",
  carpet: "layersCarpet",
  concrete: "layersConcrete",
  epoxy: "layersEpoxy",
}

function layersFor(t: SheetT, materialId: string): string {
  const id = materialId.toLowerCase()
  let key: LayerKey = "concrete"
  const direct = LAYER_KEYS.find((k) => id.includes(k))
  if (direct) key = direct
  else if (id.includes("marble") || id.includes("terrazzo")) key = "granite"
  else if (id.includes("wood") || id.includes("oak") || id.includes("ash") || id.includes("walnut") || id.includes("wenge")) key = "parquet"
  else if (id.includes("vinyl")) key = "laminate"
  return t(`adminBuilderSheet.sheetText.${LAYER_TEXT[key]}`)
}

/** Экспликация полов: типы полов по материалам с составом конструкции. */
export function floorTypes(floor: Floor, t: SheetT, numbers: Map<string, string> = new Map()): FloorTypeRow[] {
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
    covering: materialName(t, id, "granite"),
    layers: layersFor(t, id),
    rooms: v.rooms.join(", "),
    areaM2: Math.round(v.area * 10) / 10,
  }))
}
