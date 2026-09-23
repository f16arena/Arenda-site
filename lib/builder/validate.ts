// Проверка модели перед выпуском чертежей: находит то, что в чертеже заметят
// первым — помещение без двери, окно, вылезающее за стену, вход без пандуса,
// этаж без лестницы. Ошибка (error) — так строить нельзя, предупреждение
// (warn) — так можно, но обычно это недосмотр.

import type { BuilderDocument, Floor, Opening } from "@/types/builder"
import type { Vec2 } from "@/core/geometry/math"
import { pointInPolygon } from "@/core/geometry/math"
import { floorRooms, type FloorRoom } from "./rooms"
import { roomDisplayName, roomUse } from "./room-use"
import { islandLabel, passageLeft, type IslandNamer } from "./islands"
import type { Messages } from "@/lib/i18n/messages"

/** Ключи замечаний в словаре; errors/warns — формы числа для сводки, не текст. */
export type IssueKey = Exclude<keyof Messages["adminBuilder"]["checks"], "errors" | "warns">

/** Существительное для подстановки в текст замечания — тоже ключ словаря. */
export type IssueNoun = "nounDoor" | "nounWindow" | "nounDoorLower" | "nounWindowLower" | "nounElevator" | "nounColumn" | "nounStair"

export type IssueLevel = "error" | "warn"

export interface Issue {
  id: string
  level: IssueLevel
  /**
   * Ключ текста в словаре (adminBuilder.checks) и подстановки к нему. Сам
   * текст собирает панель проверки: она знает язык, а модуль — только нормы.
   */
  key: IssueKey
  vars?: Record<string, string | number>
  /** что открыть по клику */
  floorId?: string
  target?: { type: "room" | "wall" | "opening" | "stair" | "island"; id: string }
  /** точка на плане, куда навести камеру */
  at?: Vec2
}

/** Минимальная ширина прохода в коридоре с арендными местами, мм (СП 1.13130). */
const MIN_PASSAGE = 1200

/** Минимальная ширина двери на путях эвакуации, мм (СП 1.13130). */
const EXIT_DOOR_MIN = 800
/** Перепад, выше которого нужен пандус для МГН, мм (СП 59.13330). */
const RAMP_NEEDED_MM = 150
/** Нормальная высота этажа общественного здания, мм. */
const LOW_CEILING = 2500

/**
 * Проёмы помещения: считаем по самому проёму, а не по стене целиком. Длинная
 * стена идёт вдоль нескольких комнат, и по её середине дверь приписывалась
 * чужому помещению — проверка ругалась «нет входа» там, где вход есть.
 */
export function openingsOfRoom(floor: Pick<Floor, "wallGraph" | "openings">, room: FloorRoom): Opening[] {
  const out: Opening[] = []
  for (const o of floor.openings) {
    const c = openingCenter(floor, o)
    if (!c) continue
    const e = floor.wallGraph.edges[o.wallId]
    const tol = Math.max(350, (e?.thickness ?? 200) * 1.5)
    if (nearPolygon(c, room.polygon, tol)) out.push(o)
  }
  return out
}

function nearPolygon(p: Vec2, poly: Vec2[], tol: number): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const dx = b.x - a.x, dy = b.y - a.y
    const len2 = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
    const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
    if (d <= tol) return true
  }
  return false
}

function center(poly: Vec2[]): Vec2 {
  const n = poly.length || 1
  return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n }
}

function openingCenter(floor: Pick<Floor, "wallGraph">, o: Opening): Vec2 | null {
  const e = floor.wallGraph.edges[o.wallId]
  if (!e) return null
  const a = floor.wallGraph.nodes[e.a], b = floor.wallGraph.nodes[e.b]
  if (!a || !b) return null
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const t = Math.min(1, Math.max(0, o.offset / len))
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/**
 * Замечание о помещении: с наименованием и без — разные строки, а не склейка.
 * В казахском «помещение «Офис»» стоит в другом порядке, чем в русском.
 */
function named(key: "roomNoDoor" | "roomNoWindow" | "roomNoLink" | "roomNoExit", name: string): { key: IssueKey; vars?: Record<string, string> } {
  return name ? { key: `${key}Named` as IssueKey, vars: { name } } : { key }
}

/** Проверки одного этажа. */
export function validateFloor(
  floor: Floor,
  opts: { lowest: boolean; multiFloor: boolean; reachedFromBelow?: boolean },
  names?: IslandNamer,
): Issue[] {
  const out: Issue[] = []
  const g = floor.wallGraph
  const rooms = floorRooms(floor)

  // 1. проёмы, вылезающие за стену — на чертеже это разрыв в стене
  for (const o of floor.openings) {
    const e = g.edges[o.wallId]
    if (!e) {
      out.push({ id: `op-orphan-${o.id}`, level: "error", key: "openingOrphan", vars: { noun: o.type === "door" ? "nounDoorLower" : "nounWindowLower" }, floorId: floor.id, target: { type: "opening", id: o.id } })
      continue
    }
    const a = g.nodes[e.a], b = g.nodes[e.b]
    if (!a || !b) continue
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (o.offset - o.width / 2 < -1 || o.offset + o.width / 2 > len + 1) {
      out.push({
        id: `op-out-${o.id}`,
        level: "error",
        key: "openingOversize",
        vars: { noun: o.type === "door" ? "nounDoor" : "nounWindow" },
        floorId: floor.id,
        target: { type: "opening", id: o.id },
        at: openingCenter(floor, o) ?? undefined,
      })
    }
    if (o.type === "window" && e.kind === "interior" && o.variant !== "curtain") {
      out.push({
        id: `op-inner-window-${o.id}`,
        level: "warn",
        key: "windowInner",
        floorId: floor.id,
        target: { type: "opening", id: o.id },
        at: openingCenter(floor, o) ?? undefined,
      })
    }
    if (o.type === "door" && o.exit && o.width < EXIT_DOOR_MIN) {
      out.push({
        id: `op-narrow-${o.id}`,
        level: "warn",
        key: "exitDoorNarrow",
        vars: { min: EXIT_DOOR_MIN, width: o.width },
        floorId: floor.id,
        target: { type: "opening", id: o.id },
        at: openingCenter(floor, o) ?? undefined,
      })
    }
  }

  // 2. помещения: вход, освещение, наименование
  for (const room of rooms) {
    const use = roomUse(floor, room)
    const name = roomDisplayName(floor, room)
    const ops = openingsOfRoom(floor, room)
    const doors = ops.filter((o) => o.type === "door")
    const windows = ops.filter((o) => o.type === "window")
    const at = center(room.polygon)
    if (room.areaMm2 > 2e6 && doors.length === 0) {
      out.push({ id: `room-nodoor-${room.id}`, level: "error", ...named("roomNoDoor", name), floorId: floor.id, target: { type: "room", id: room.id }, at })
    }
    if (use === "rent" && room.areaMm2 > 8e6 && windows.length === 0) {
      out.push({ id: `room-nowin-${room.id}`, level: "warn", ...named("roomNoWindow", name), floorId: floor.id, target: { type: "room", id: room.id }, at })
    }
    if (use === "rent" && room.areaMm2 > 10e6 && !floor.premiseLinks?.[room.id]) {
      out.push({
        id: `room-nolink-${room.id}`,
        level: "warn",
        ...named("roomNoLink", name),
        floorId: floor.id,
        target: { type: "room", id: room.id },
        at,
      })
    }
    if (use === "rent" && !name) {
      out.push({ id: `room-noname-${room.id}`, level: "warn", key: "roomNoName", floorId: floor.id, target: { type: "room", id: room.id }, at })
    }
  }

  // 2б. путь наружу: из каждого помещения должна быть цепочка дверей до выхода
  {
    const doorLinks: Array<{ a?: string; b?: string }> = []
    for (const o of floor.openings) {
      if (o.type !== "door") continue
      const e = g.edges[o.wallId]
      const c = openingCenter(floor, o)
      if (!e || !c) continue
      const a = g.nodes[e.a], b = g.nodes[e.b]
      if (!a || !b) continue
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len }
      const probe = e.thickness / 2 + 350
      const side = (sign: 1 | -1) => {
        const p = { x: c.x + n.x * probe * sign, y: c.y + n.y * probe * sign }
        return rooms.find((r) => pointInPolygon(p, r.polygon) && !(r.holes ?? []).some((h) => pointInPolygon(p, h)))?.id
      }
      doorLinks.push({ a: side(1), b: side(-1) })
    }
    // помещение с наружной дверью (по другую сторону — улица) считается выходом
    const exitRooms = new Set<string>()
    for (const l of doorLinks) {
      if (l.a && !l.b) exitRooms.add(l.a)
      if (l.b && !l.a) exitRooms.add(l.b)
    }
    if (exitRooms.size) {
      const near = new Map<string, string[]>()
      for (const l of doorLinks) {
        if (!l.a || !l.b) continue
        near.set(l.a, [...(near.get(l.a) ?? []), l.b])
        near.set(l.b, [...(near.get(l.b) ?? []), l.a])
      }
      const seen = new Set(exitRooms)
      const queue = [...exitRooms]
      while (queue.length) {
        const id = queue.shift()!
        for (const next of near.get(id) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next) }
      }
      for (const room of rooms) {
        if (seen.has(room.id) || room.areaMm2 < 4e6) continue
        const name = roomDisplayName(floor, room)
        out.push({
          id: `room-noexit-${room.id}`,
          level: "error",
          ...named("roomNoExit", name),
          floorId: floor.id,
          target: { type: "room", id: room.id },
          at: center(room.polygon),
        })
      }
    }
  }

  // 3. связь между этажами: свой марш либо марш снизу, который сюда приходит
  const links = (floor.stairs ?? []).filter((s) => s.shape !== "column" && s.shape !== "porch" && s.shape !== "ramp")
  if (opts.multiFloor && links.length === 0 && !opts.reachedFromBelow) {
    out.push({ id: `floor-nostair-${floor.id}`, level: "error", key: "floorNoStair", vars: { name: floor.name }, floorId: floor.id })
  }

  // 4. вход с перепадом без пандуса — нижний этаж
  if (opts.lowest) {
    const entrances = floor.openings.filter((o) => o.type === "door" && o.exit)
    const ramps = (floor.stairs ?? []).filter((s) => s.shape === "ramp")
    if (entrances.length > 0 && ramps.length === 0 && Math.abs(floor.elevation) > RAMP_NEEDED_MM) {
      out.push({
        id: `floor-noramp-${floor.id}`,
        level: "warn",
        key: "noRamp",
        vars: { value: Math.round(Math.abs(floor.elevation)) },
        floorId: floor.id,
        at: openingCenter(floor, entrances[0]) ?? undefined,
      })
    }
  }

  // 4б. эвакуационные выходы: без них план эвакуации пустой
  if (opts.lowest) {
    const doors = floor.openings.filter((o) => o.type === "door")
    if (doors.length > 0 && !doors.some((o) => o.exit)) {
      out.push({
        id: `floor-noexit-${floor.id}`,
        level: "warn",
        key: "noExitMarked",
        floorId: floor.id,
      })
    }
  }

  // 5. высота этажа
  if (floor.height > 0 && floor.height < LOW_CEILING) {
    out.push({ id: `floor-low-${floor.id}`, level: "warn", key: "lowCeiling", vars: { name: floor.name, value: floor.height }, floorId: floor.id })
  }

  // 6. вырожденные стены
  for (const id in g.edges) {
    const e = g.edges[id]
    const a = g.nodes[e.a], b = g.nodes[e.b]
    if (!a || !b) continue
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 50) {
      out.push({ id: `wall-short-${id}`, level: "error", key: "wallShort", vars: { value: Math.round(len) }, floorId: floor.id, target: { type: "wall", id } })
    }
  }

  // 7. лестница или колонна вне здания
  for (const st of floor.stairs ?? []) {
    if (st.shape === "porch" || st.shape === "ramp") continue
    const inside = rooms.some((r) => pointInPolygon({ x: st.position.x, y: st.position.y }, r.polygon))
    if (!inside) {
      out.push({
        id: `stair-out-${st.id}`,
        level: "error",
        key: "outside",
        vars: { noun: st.shape === "elevator" ? "nounElevator" : st.shape === "column" ? "nounColumn" : "nounStair" },
        floorId: floor.id,
        target: { type: "stair", id: st.id },
        at: { x: st.position.x, y: st.position.y },
      })
    }
  }

  // 8. арендное место в общей зоне: не должно стоять вне здания и не должно
  // съедать эвакуационный проход (СП 1.13130 — не меньше 1,2 м в коридоре)
  for (const isl of floor.islands ?? []) {
    const room = rooms.find((r) => pointInPolygon(isl.position, r.polygon))
    if (!room) {
      out.push({
        id: `island-out-${isl.id}`,
        level: "error",
        key: "islandOutside",
        vars: { name: islandLabel(isl, names) },
        floorId: floor.id,
        target: { type: "island", id: isl.id },
        at: { x: isl.position.x, y: isl.position.y },
      })
      continue
    }
    const left = passageLeft(isl, room.polygon)
    if (left < MIN_PASSAGE) {
      out.push({
        id: `island-narrow-${isl.id}`,
        level: "warn",
        key: "islandNarrow",
        vars: { name: islandLabel(isl, names), value: Math.round(left), min: MIN_PASSAGE },
        floorId: floor.id,
        target: { type: "island", id: isl.id },
        at: { x: isl.position.x, y: isl.position.y },
      })
    }
  }

  return out
}

/** Проверка всей модели: по всем зданиям и этажам. */
export function validateDocument(doc: BuilderDocument, names?: IslandNamer): Issue[] {
  const out: Issue[] = []
  for (const b of doc.buildings) {
    const floors = [...b.floors].sort((x, y) => x.elevation - y.elevation)
    const multi = floors.length > 1
    // куда приходят марши с других этажей — у верхнего этажа своей лестницы не бывает
    const reached = new Set<string>()
    for (const f of floors) {
      for (const s of f.stairs ?? []) {
        if (s.shape === "column" || s.shape === "porch" || s.shape === "ramp") continue
        if (s.toFloorId && s.toFloorId !== f.id) reached.add(s.toFloorId)
      }
    }
    for (const f of floors) {
      const hasWalls = Object.keys(f.wallGraph.edges).length > 0
      if (!hasWalls) continue
      out.push(...validateFloor(f, { lowest: f.id === floors[0].id, multiFloor: multi, reachedFromBelow: reached.has(f.id) }, names))
    }
  }
  // сначала ошибки, потом предупреждения
  return out.sort((a, c) => (a.level === c.level ? 0 : a.level === "error" ? -1 : 1))
}

/**
 * Сводка для кнопки: сколько ошибок и сколько замечаний. Склонения у чисел
 * свои в каждом языке, поэтому строки собирает вызывающий через tp().
 */
export function issuesCount(issues: Issue[]): { errors: number; warns: number } {
  const errors = issues.filter((i) => i.level === "error").length
  return { errors, warns: issues.length - errors }
}
