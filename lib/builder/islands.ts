// Островки — арендные места в общих зонах: вендинговый автомат, киоск, банкомат,
// стойка выдачи, кофе-точка. Стенами такое место не огорожено, помещением его не
// распознать, но сдаётся оно так же, как помещение: у него есть арендатор,
// площадь и номер в ведомости. Здесь — размеры типовых мест, геометрия габарита
// и сводка по этажу.

import type { Floor, Island, IslandKind } from "@/types/builder"
import type { Vec2 } from "@/core/geometry/math"
import { pointInPolygon } from "@/core/geometry/math"

export interface IslandPreset {
  label: string
  /** габарит по умолчанию, мм */
  width: number
  depth: number
  height: number
}

// Размеры взяты по типовому оборудованию: вендинг ~0,9×0,8 м, банкомат ~0,7×0,7,
// киоск — уже полноценная торговая точка.
export const ISLAND_PRESETS: Record<IslandKind, IslandPreset> = {
  vending: { label: "Вендинговый автомат", width: 900, depth: 800, height: 1830 },
  kiosk: { label: "Киоск", width: 2500, depth: 2000, height: 2400 },
  atm: { label: "Банкомат", width: 700, depth: 700, height: 1650 },
  counter: { label: "Стойка", width: 1600, depth: 700, height: 1100 },
  coffee: { label: "Кофе-точка", width: 1200, depth: 900, height: 1900 },
  rack: { label: "Торговая стойка", width: 1000, depth: 1000, height: 1600 },
  banner: { label: "Баннер на стене", width: 3000, depth: 80, height: 1500 },
  lightbox: { label: "Лайтбокс", width: 1200, depth: 150, height: 1800 },
  other: { label: "Арендное место", width: 1000, depth: 1000, height: 1500 },
}

/** Рекламные места висят на стене: пола они не занимают и проход не сужают. */
export const WALL_MOUNTED: ReadonlySet<IslandKind> = new Set<IslandKind>(["banner", "lightbox"])

export function isWallMounted(island: Island): boolean {
  return WALL_MOUNTED.has(island.kind)
}

/** Высота низа места над полом, мм: у рекламы по умолчанию 1,2 м. */
export function mountHeight(island: Island): number {
  return island.mountHeight ?? (isWallMounted(island) ? 1200 : 0)
}

/** Наименование для плана и ведомости: своё, иначе типовое по виду места. */
export function islandLabel(island: Island): string {
  const own = (island.name ?? "").trim()
  return own || ISLAND_PRESETS[island.kind].label
}

/** Габарит места в координатах плана (мм), по часовой от левого нижнего угла. */
export function islandPolygon(island: Island): Vec2[] {
  const a = ((island.rotationDeg || 0) * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const hw = island.width / 2
  const hd = island.depth / 2
  const corners: Vec2[] = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ]
  return corners.map((c) => ({
    x: island.position.x + c.x * cos - c.y * sin,
    y: island.position.y + c.x * sin + c.y * cos,
  }))
}

/** Площадь места, м² — по габариту: именно за него платят аренду. */
export function islandArea(island: Island): number {
  return (island.width * island.depth) / 1_000_000
}

/** Место под точкой (для выбора на плане); последнее нарисованное — сверху. */
export function islandAt(floor: Floor, p: Vec2): Island | undefined {
  const list = floor.islands ?? []
  for (let i = list.length - 1; i >= 0; i--) {
    if (pointInPolygon(p, islandPolygon(list[i]))) return list[i]
  }
  return undefined
}

export interface IslandRow {
  id: string
  /** номер места: «1.3» — этаж 1, место 3 */
  mark: string
  floorName: string
  name: string
  kind: IslandKind
  tenant: string
  /** где стоит: наименование помещения (коридор, холл), если удалось определить */
  place: string
  area: number
  size: string
}

interface RoomLike {
  id: string
  polygon: Vec2[]
}

/**
 * Ведомость арендных мест по этажам. `roomsOf` даёт помещения этажа, чтобы
 * подписать, где место стоит («Коридор», «Холл») — без этого в ведомости
 * непонятно, к чему относится строка.
 */
export function islandSchedule(
  floors: Floor[],
  roomsOf?: (floor: Floor) => RoomLike[],
  roomName?: (floor: Floor, roomId: string) => string,
): IslandRow[] {
  const rows: IslandRow[] = []
  for (const floor of floors) {
    const list = floor.islands ?? []
    if (!list.length) continue
    const rooms = roomsOf ? roomsOf(floor) : []
    list.forEach((island, idx) => {
      const room = rooms.find((r) => pointInPolygon(island.position, r.polygon))
      rows.push({
        id: island.id,
        mark: `${floor.level}.${idx + 1}`,
        floorName: floor.name,
        name: islandLabel(island),
        kind: island.kind,
        tenant: (island.tenant ?? "").trim(),
        place: room && roomName ? roomName(floor, room.id) : "",
        area: Math.round(islandArea(island) * 100) / 100,
        size: `${island.width}×${island.depth}`,
      })
    })
  }
  return rows
}

/** Итог по ведомости: сколько мест и сколько суммарной площади сдаётся. */
export function islandsTotal(rows: IslandRow[]): { count: number; area: number; leased: number } {
  const area = rows.reduce((s, r) => s + r.area, 0)
  return {
    count: rows.length,
    area: Math.round(area * 100) / 100,
    leased: rows.filter((r) => r.tenant).length,
  }
}

/**
 * Место мешает проходу? Норматив эвакуации требует оставлять в коридоре
 * не меньше 1,2 м чистой ширины — островок, вставший поперёк, это нарушение.
 * Возвращает свободную ширину прохода с двух сторон места вдоль коридора.
 */
export function passageLeft(island: Island, corridor: Vec2[]): number {
  if (corridor.length < 3) return Infinity
  // реклама на стене пола не занимает — проход она не сужает
  if (isWallMounted(island)) return Infinity
  const xs = corridor.map((p) => p.x)
  const ys = corridor.map((p) => p.y)
  const w = Math.max(...xs) - Math.min(...xs)
  const h = Math.max(...ys) - Math.min(...ys)
  // длинная сторона коридора — направление движения; проход считаем поперёк неё
  const across = w >= h ? h : w
  const poly = islandPolygon(island)
  const acrossIsY = w >= h
  const lo = Math.min(...poly.map((p) => (acrossIsY ? p.y : p.x)))
  const hi = Math.max(...poly.map((p) => (acrossIsY ? p.y : p.x)))
  const cLo = Math.min(...(acrossIsY ? ys : xs))
  const cHi = Math.max(...(acrossIsY ? ys : xs))
  const before = Math.max(0, lo - cLo)
  const after = Math.max(0, cHi - hi)
  // место может стоять у стены — тогда проход это вся оставшаяся сторона
  return Math.min(across, Math.max(before, after))
}
