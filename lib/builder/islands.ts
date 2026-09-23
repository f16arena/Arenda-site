// Островки — арендные места в общих зонах: вендинговый автомат, киоск, банкомат,
// стойка выдачи, кофе-точка. Стенами такое место не огорожено, помещением его не
// распознать, но сдаётся оно так же, как помещение: у него есть арендатор,
// площадь и номер в ведомости. Здесь — размеры типовых мест, геометрия габарита
// и сводка по этажу.

import type { Floor, Island, IslandKind } from "@/types/builder"
import type { Vec2 } from "@/core/geometry/math"
import { pointInPolygon } from "@/core/geometry/math"
import { floorRooms } from "./rooms"
import type { Messages } from "@/lib/i18n/messages"
import type { SheetT } from "./sheet-text"

/** Ключ подписи вида места в словаре — он же сам вид. */
export type IslandNameKey = keyof Messages["adminBuilder"]["islands"]["kinds"]

export interface IslandPreset {
  /** ключ подписи в словаре (adminBuilder.islands.kinds) — он же вид места */
  label: IslandNameKey
  /** габарит по умолчанию, мм */
  width: number
  depth: number
  height: number
}

// Размеры взяты по типовому оборудованию: вендинг ~0,9×0,8 м, банкомат ~0,7×0,7,
// киоск — уже полноценная торговая точка.
export const ISLAND_PRESETS: Record<IslandKind, IslandPreset> = {
  vending: { label: "vending", width: 900, depth: 800, height: 1830 },
  kiosk: { label: "kiosk", width: 2500, depth: 2000, height: 2400 },
  atm: { label: "atm", width: 700, depth: 700, height: 1650 },
  counter: { label: "counter", width: 1600, depth: 700, height: 1100 },
  coffee: { label: "coffee", width: 1200, depth: 900, height: 1900 },
  rack: { label: "rack", width: 1000, depth: 1000, height: 1600 },
  banner: { label: "banner", width: 3000, depth: 80, height: 1500 },
  lightbox: { label: "lightbox", width: 1200, depth: 150, height: 1800 },
  // парковка: легковое место по СП 113.13330 — 2,5 × 5,3 м, грузовое крупнее
  parking: { label: "parking", width: 2500, depth: 5300, height: 0 },
  parking_truck: { label: "parking_truck", width: 3500, depth: 8000, height: 0 },
  parking_moto: { label: "parking_moto", width: 1000, depth: 2500, height: 0 },
  // территория: киоск и морской контейнер (20 футов — 6058 × 2438 мм)
  kiosk_out: { label: "kiosk_out", width: 3000, depth: 2200, height: 2700 },
  container: { label: "container", width: 6058, depth: 2438, height: 2591 },
  // кровля: антенно-мачтовое сооружение и базовая станция оператора
  antenna: { label: "antenna", width: 1200, depth: 1200, height: 6000 },
  bts: { label: "bts", width: 1500, depth: 1000, height: 2000 },
  other: { label: "other", width: 1000, depth: 1000, height: 1500 },
}

/** Рекламные места висят на стене: пола они не занимают и проход не сужают. */
export const WALL_MOUNTED: ReadonlySet<IslandKind> = new Set<IslandKind>(["banner", "lightbox"])

/** Места на участке: парковка размечается на земле, а не стоит в помещении. */
export const OUTDOOR_KINDS: ReadonlySet<IslandKind> = new Set<IslandKind>(["parking", "parking_truck", "parking_moto", "kiosk_out", "container"])

/** Места на кровле: антенны операторов, базовые станции — ставятся на крышу. */
export const ROOF_KINDS: ReadonlySet<IslandKind> = new Set<IslandKind>(["antenna", "bts"])

export function isRoofPlace(island: Island): boolean {
  return ROOF_KINDS.has(island.kind)
}

export function isParking(island: Island): boolean {
  return island.kind === "parking" || island.kind === "parking_truck" || island.kind === "parking_moto"
}

export function isWallMounted(island: Island): boolean {
  return WALL_MOUNTED.has(island.kind)
}

/** Высота низа места над полом, мм: у рекламы по умолчанию 1,2 м. */
export function mountHeight(island: Island): number {
  return island.mountHeight ?? (isWallMounted(island) ? 1200 : 0)
}

/** Марка места: одна и та же на плане и в ведомости. */
export function islandMark(level: number, index: number): string {
  return `М${level}.${index + 1}`
}

/**
 * Как назвать вид места на языке пользователя: вызывающий берёт подпись из
 * словаря (adminBuilder.islands.kinds). Без этого модуль пришлось бы держать
 * в двух языках, а он про геометрию и нормы, не про текст.
 */
export type IslandNamer = (kind: IslandKind) => string

/** Наименование для плана и ведомости: своё, иначе типовое по виду места. */
export function islandLabel(island: Island, kindName?: IslandNamer): string {
  const own = (island.name ?? "").trim()
  return own || (kindName ? kindName(island.kind) : ISLAND_PRESETS[island.kind].label)
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
  /** марка места: «М1.3» — этаж 1, место 3; та же марка стоит на плане */
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
 * Подписи ведомости, которых нет в геометрии: вид места и куда его отнесли.
 * Без них строки выходят с ключами словаря — так их видят только тесты.
 */
export interface IslandNames {
  kind: IslandNamer
  roof: string
  parking: string
  site: string
  siteFloor: string
}

/** Подписи ведомости из словаря — один вызов вместо объекта в каждом листе. */
export function islandNames(t: SheetT): IslandNames {
  return {
    kind: (kind) => t(`adminBuilder.islands.kinds.${kind}`),
    roof: t("adminBuilder.islands.placeRoof"),
    parking: t("adminBuilder.islands.placeParking"),
    site: t("adminBuilder.islands.placeSite"),
    siteFloor: t("adminBuilder.islands.siteFloor"),
  }
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
  names?: IslandNames,
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
        mark: islandMark(floor.level, idx),
        floorName: floor.name,
        name: islandLabel(island, names?.kind),
        kind: island.kind,
        tenant: (island.tenant ?? "").trim(),
        place: isRoofPlace(island) ? names?.roof ?? "placeRoof" : room && roomName ? roomName(floor, room.id) : "",
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

/**
 * Прижать место к стенам помещения: габарит не должен уходить за контур и
 * торчать сквозь стену. Для каждой грани помещения считаем, насколько угол
 * места вылез наружу, и двигаем центр внутрь на эту величину. Несколько
 * проходов — чтобы место, вылезшее сразу в двух направлениях (угол комнаты),
 * встало в угол, а не прыгало от стены к стене.
 *
 * `room` — контур по внутренним граням стен, `margin` — зазор до стены, мм.
 */
export function clampToRoom(island: Island, room: Vec2[], at: Vec2, margin = 0): Vec2 {
  if (room.length < 3) return at
  let c = { ...at }
  for (let pass = 0; pass < 4; pass++) {
    let moved = false
    for (let i = 0; i < room.length; i++) {
      const a = room[i]
      const b = room[(i + 1) % room.length]
      const ex = b.x - a.x
      const ey = b.y - a.y
      const len = Math.hypot(ex, ey)
      if (len < 1) continue
      // нормаль грани; внутрь — та сторона, где лежит центр помещения
      let nx = -ey / len
      let ny = ex / len
      const cx = room.reduce((s, p) => s + p.x, 0) / room.length
      const cy = room.reduce((s, p) => s + p.y, 0) / room.length
      if ((cx - a.x) * nx + (cy - a.y) * ny < 0) {
        nx = -nx
        ny = -ny
      }
      // самый «наружный» угол места относительно этой грани
      const corners = islandPolygon({ ...island, position: c })
      let worst = Infinity
      for (const p of corners) {
        const d = (p.x - a.x) * nx + (p.y - a.y) * ny
        if (d < worst) worst = d
      }
      const need = margin - worst
      if (need > 0.5) {
        c = { x: c.x + nx * need, y: c.y + ny * need }
        moved = true
      }
    }
    if (!moved) break
  }
  return { x: Math.round(c.x), y: Math.round(c.y) }
}

/**
 * Куда реально встанет место на этаже: находим помещение под точкой и
 * прижимаем габарит к его стенам. Если точка вне помещений (снаружи здания),
 * оставляем как есть — такое место поймает проверка модели.
 */
export function fitToFloor(floor: Floor, island: Island, at: Vec2, margin = 0): Vec2 {
  const room = floorRooms(floor).find((r) => pointInPolygon(at, r.polygon))
  if (!room) return { x: Math.round(at.x), y: Math.round(at.y) }
  return clampToRoom(island, room.polygon, at, margin)
}

/**
 * Ведомость по всему проекту: места на этажах плюс места на участке
 * (парковка). У участка своя «этажность» — в ведомости это строка «Участок».
 */
export function projectIslandSchedule(
  floors: Floor[],
  siteIslands: Island[],
  roomsOf?: (floor: Floor) => RoomLike[],
  roomName?: (floor: Floor, roomId: string) => string,
  names?: IslandNames,
): IslandRow[] {
  const rows = islandSchedule(floors, roomsOf, roomName, names)
  siteIslands.forEach((island, idx) => {
    rows.push({
      id: island.id,
      mark: `П${idx + 1}`,
      floorName: names?.siteFloor ?? "siteFloor",
      name: islandLabel(island, names?.kind),
      kind: island.kind,
      tenant: (island.tenant ?? "").trim(),
      place: isParking(island) ? names?.parking ?? "placeParking" : names?.site ?? "placeSite",
      area: Math.round(islandArea(island) * 100) / 100,
      size: `${island.width}×${island.depth}`,
    })
  })
  return rows
}
