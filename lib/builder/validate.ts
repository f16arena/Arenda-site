// Проверка модели перед выпуском чертежей: находит то, что в чертеже заметят
// первым — помещение без двери, окно, вылезающее за стену, вход без пандуса,
// этаж без лестницы. Ошибка (error) — так строить нельзя, предупреждение
// (warn) — так можно, но обычно это недосмотр.

import type { BuilderDocument, Floor, Opening } from "@/types/builder"
import type { Vec2 } from "@/core/geometry/math"
import { pointInPolygon } from "@/core/geometry/math"
import { floorRooms, type FloorRoom } from "./rooms"
import { roomDisplayName, roomUse } from "./room-use"

export type IssueLevel = "error" | "warn"

export interface Issue {
  id: string
  level: IssueLevel
  /** короткий текст для списка */
  text: string
  /** что открыть по клику */
  floorId?: string
  target?: { type: "room" | "wall" | "opening" | "stair"; id: string }
  /** точка на плане, куда навести камеру */
  at?: Vec2
}

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
function openingsOfRoom(floor: Pick<Floor, "wallGraph" | "openings">, room: FloorRoom): Opening[] {
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

/** Проверки одного этажа. */
export function validateFloor(floor: Floor, opts: { lowest: boolean; multiFloor: boolean }): Issue[] {
  const out: Issue[] = []
  const g = floor.wallGraph
  const rooms = floorRooms(floor)

  // 1. проёмы, вылезающие за стену — на чертеже это разрыв в стене
  for (const o of floor.openings) {
    const e = g.edges[o.wallId]
    if (!e) {
      out.push({ id: `op-orphan-${o.id}`, level: "error", text: `Проём без стены (${o.type === "door" ? "дверь" : "окно"})`, floorId: floor.id, target: { type: "opening", id: o.id } })
      continue
    }
    const a = g.nodes[e.a], b = g.nodes[e.b]
    if (!a || !b) continue
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (o.offset - o.width / 2 < -1 || o.offset + o.width / 2 > len + 1) {
      out.push({
        id: `op-out-${o.id}`,
        level: "error",
        text: `${o.type === "door" ? "Дверь" : "Окно"} шире стены или выходит за её край`,
        floorId: floor.id,
        target: { type: "opening", id: o.id },
        at: openingCenter(floor, o) ?? undefined,
      })
    }
    if (o.type === "door" && o.exit && o.width < EXIT_DOOR_MIN) {
      out.push({
        id: `op-narrow-${o.id}`,
        level: "warn",
        text: `Эвакуационная дверь уже ${EXIT_DOOR_MIN} мм (${o.width} мм)`,
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
      out.push({ id: `room-nodoor-${room.id}`, level: "error", text: `В помещение${name ? ` «${name}»` : ""} нет входа: ни одной двери`, floorId: floor.id, target: { type: "room", id: room.id }, at })
    }
    if (use === "rent" && room.areaMm2 > 8e6 && windows.length === 0) {
      out.push({ id: `room-nowin-${room.id}`, level: "warn", text: `Помещение${name ? ` «${name}»` : ""} без окон — нет естественного освещения`, floorId: floor.id, target: { type: "room", id: room.id }, at })
    }
    if (use === "rent" && !name) {
      out.push({ id: `room-noname-${room.id}`, level: "warn", text: "Помещение без наименования — в экспликации будет пусто", floorId: floor.id, target: { type: "room", id: room.id }, at })
    }
  }

  // 3. связь между этажами
  const links = (floor.stairs ?? []).filter((s) => s.shape !== "column" && s.shape !== "porch" && s.shape !== "ramp")
  if (opts.multiFloor && links.length === 0) {
    out.push({ id: `floor-nostair-${floor.id}`, level: "error", text: `Этаж «${floor.name}» ни с чем не связан: нет лестницы или лифта`, floorId: floor.id })
  }

  // 4. вход с перепадом без пандуса — нижний этаж
  if (opts.lowest) {
    const entrances = floor.openings.filter((o) => o.type === "door" && o.exit)
    const ramps = (floor.stairs ?? []).filter((s) => s.shape === "ramp")
    if (entrances.length > 0 && ramps.length === 0 && Math.abs(floor.elevation) > RAMP_NEEDED_MM) {
      out.push({
        id: `floor-noramp-${floor.id}`,
        level: "warn",
        text: `Вход выше земли на ${Math.round(Math.abs(floor.elevation))} мм, а пандуса нет — здание недоступно для МГН`,
        floorId: floor.id,
        at: openingCenter(floor, entrances[0]) ?? undefined,
      })
    }
  }

  // 5. высота этажа
  if (floor.height > 0 && floor.height < LOW_CEILING) {
    out.push({ id: `floor-low-${floor.id}`, level: "warn", text: `Высота этажа «${floor.name}» всего ${floor.height} мм`, floorId: floor.id })
  }

  // 6. вырожденные стены
  for (const id in g.edges) {
    const e = g.edges[id]
    const a = g.nodes[e.a], b = g.nodes[e.b]
    if (!a || !b) continue
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len < 50) {
      out.push({ id: `wall-short-${id}`, level: "error", text: `Стена длиной ${Math.round(len)} мм — скорее всего, случайный клик`, floorId: floor.id, target: { type: "wall", id } })
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
        text: `${st.shape === "elevator" ? "Лифт" : st.shape === "column" ? "Колонна" : "Лестница"} стоит вне здания`,
        floorId: floor.id,
        target: { type: "stair", id: st.id },
        at: { x: st.position.x, y: st.position.y },
      })
    }
  }

  return out
}

/** Проверка всей модели: по всем зданиям и этажам. */
export function validateDocument(doc: BuilderDocument): Issue[] {
  const out: Issue[] = []
  for (const b of doc.buildings) {
    const floors = [...b.floors].sort((x, y) => x.elevation - y.elevation)
    const multi = floors.length > 1
    for (const f of floors) {
      const hasWalls = Object.keys(f.wallGraph.edges).length > 0
      if (!hasWalls) continue
      out.push(...validateFloor(f, { lowest: f.id === floors[0].id, multiFloor: multi }))
    }
  }
  // сначала ошибки, потом предупреждения
  return out.sort((a, c) => (a.level === c.level ? 0 : a.level === "error" ? -1 : 1))
}

/** Сводка для кнопки: «2 ошибки, 5 предупреждений». */
export function issuesSummary(issues: Issue[]): string {
  const e = issues.filter((i) => i.level === "error").length
  const w = issues.length - e
  if (!issues.length) return "Замечаний нет"
  const plural = (n: number, one: string, few: string, many: string) =>
    n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many
  const parts: string[] = []
  if (e) parts.push(`${e} ${plural(e, "ошибка", "ошибки", "ошибок")}`)
  if (w) parts.push(`${w} ${plural(w, "замечание", "замечания", "замечаний")}`)
  return parts.join(", ")
}
