// План эвакуации (ГОСТ Р 12.2.143, ГОСТ 12.4.026): пути от каждого помещения
// к ближайшему выходу наружу, знаки выходов, лестницы и первичные средства
// пожаротушения. Путь строится по дверям: помещение → дверь → соседнее
// помещение, поиск в ширину до двери наружу, без прохода сквозь стены.

import type { Floor } from "@/types/builder"
import { floorRooms, type FloorRoom } from "@/lib/builder/rooms"
import { labelPoint } from "./floor-drawing"
import { pointInPolygon, type Vec2 } from "@/core/geometry/math"
import { roomUse } from "@/lib/builder/room-use"
import { stairHoleWorld } from "@/lib/builder/stair-hole"

export interface EvacDoor {
  id: string
  /** центр проёма в плане */
  at: Vec2
  left?: string
  right?: string
  /** дверь наружу */
  exterior: boolean
  exit?: "main" | "emergency"
}

export interface EvacuationPlan {
  /** огнетушители: по одному у каждого эвакуационного выхода */
  extinguishers: Vec2[]
  /** пути эвакуации: ломаные из точек помещений и дверей */
  routes: Vec2[][]
  /** выходы наружу: точка двери и направление наружу */
  exits: Array<{ at: Vec2; dir: Vec2; kind: "main" | "emergency" }>
  /** лестницы на плане — как эвакуационные пути вниз */
  stairs: Vec2[][]
  /** выходы на лестницу: на этажах выше первого путь ведёт к лестничной клетке */
  stairExits: Array<{ at: Vec2; dir: Vec2 }>
  /** помещения без выхода (тупики) — их подсвечиваем */
  isolated: string[]
}

/** Двери этажа с помещениями по обе стороны. */
export function evacDoors(floor: Floor, rooms: FloorRoom[]): EvacDoor[] {
  const g = floor.wallGraph
  const roomAt = (p: Vec2) => rooms.find((r) => pointInPolygon(p, r.polygon) && !(r.holes ?? []).some((h) => pointInPolygon(p, h)))
  const out: EvacDoor[] = []
  for (const o of floor.openings) {
    if (o.type !== "door" || o.phase === "demolish") continue
    const e = g.edges[o.wallId]
    const a = e && g.nodes[e.a]
    const b = e && g.nodes[e.b]
    if (!e || !a || !b) continue
    const L = Math.hypot(b.x - a.x, b.y - a.y)
    if (L < 1) continue
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }
    const n = { x: -u.y, y: u.x }
    const c = { x: a.x + u.x * o.offset, y: a.y + u.y * o.offset }
    const probe = e.thickness / 2 + 350
    const left = roomAt({ x: c.x + n.x * probe, y: c.y + n.y * probe })?.id
    const right = roomAt({ x: c.x - n.x * probe, y: c.y - n.y * probe })?.id
    out.push({ id: o.id, at: c, left, right, exterior: !left || !right, exit: o.exit })
  }
  return out
}

export function buildEvacuation(floor: Floor): EvacuationPlan {
  const rooms = floorRooms(floor)
  const doors = evacDoors(floor, rooms)
  const centre = new Map(rooms.map((r) => [r.id, labelPoint(r.polygon, r.holes ?? [])]))

  // от каждой наружной двери — поиск в ширину внутрь здания
  const prev = new Map<string, { room: string; door: EvacDoor }>()
  const dist = new Map<string, number>()
  const queue: string[] = []
  const exitDoor = new Map<string, EvacDoor>()
  for (const d of doors) {
    if (!d.exterior) continue
    const inner = d.left ?? d.right
    if (!inner || dist.has(inner)) continue
    dist.set(inner, 0)
    exitDoor.set(inner, d)
    queue.push(inner)
  }
  // Этажи выше первого наружных дверей не имеют: эвакуация идёт к лестничной
  // клетке. Лифт выходом не считается — по нормам при пожаре им не пользуются.
  const stairPoint = new Map<string, Vec2>()
  for (const st of floor.stairs ?? []) {
    if (st.shape === "column" || st.shape === "elevator" || st.shape === "porch" || st.shape === "ramp") continue
    const hole = stairHoleWorld(st, floor.height)
    // марш может выходить за помещение (лестничная клетка уже марша): пробуем
    // центр выреза, точку установки и углы — берём первую, попавшую в комнату
    const spots: Vec2[] = [
      { x: (hole[0].x + hole[2].x) / 2, y: (hole[0].y + hole[2].y) / 2 },
      { x: st.position.x, y: st.position.y },
      ...hole,
    ]
    let room: FloorRoom | undefined
    let c: Vec2 | undefined
    for (const p of spots) {
      room = rooms.find((r) => pointInPolygon(p, r.polygon))
      if (room) { c = p; break }
    }
    if (!room || !c) continue
    if (!stairPoint.has(room.id)) stairPoint.set(room.id, c)
    if (dist.has(room.id)) continue
    dist.set(room.id, 0)
    queue.push(room.id)
  }
  while (queue.length) {
    const cur = queue.shift() as string
    const step = (dist.get(cur) ?? 0) + 1
    for (const d of doors) {
      if (d.exterior) continue
      const other = d.left === cur ? d.right : d.right === cur ? d.left : undefined
      if (!other || dist.has(other)) continue
      dist.set(other, step)
      prev.set(other, { room: cur, door: d })
      queue.push(other)
    }
  }

  // путь внутри помещения — по прямым углам, как на чертеже: из двух вариантов
  // Г-образного хода берём тот, что целиком лежит внутри помещения
  const corner = (a: Vec2, b: Vec2, poly: Vec2[] | undefined): Vec2 | null => {
    if (!poly) return null
    const c1 = { x: a.x, y: b.y }
    const c2 = { x: b.x, y: a.y }
    if (pointInPolygon(c1, poly)) return c1
    if (pointInPolygon(c2, poly)) return c2
    return null
  }
  const polyOf = (id: string | undefined) => rooms.find((x) => x.id === id)?.polygon
  const routes: Vec2[][] = []
  const isolated: string[] = []
  for (const r of rooms) {
    const c = centre.get(r.id)
    if (!c) continue
    if (!dist.has(r.id)) { isolated.push(r.id); continue }
    const path: Vec2[] = [c]
    const go = (to: Vec2, roomId: string) => {
      const from = path[path.length - 1]
      const k = corner(from, to, polyOf(roomId))
      if (k) path.push(k)
      path.push(to)
    }
    let cur = r.id
    for (let guard = 0; guard < rooms.length + 2; guard++) {
      const step = prev.get(cur)
      if (!step) break
      go(step.door.at, cur)
      const next = centre.get(step.room)
      if (next) go(next, step.room)
      cur = step.room
    }
    const last = exitDoor.get(cur)
    if (last) go(last.at, cur)
    else {
      const st = stairPoint.get(cur)
      if (st) go(st, cur)
    }
    if (path.length > 1) routes.push(path)
  }

  const exits: EvacuationPlan["exits"] = []
  for (const d of doors) {
    if (!d.exterior) continue
    const inner = d.left ?? d.right
    const c = inner ? centre.get(inner) : undefined
    const dx = c ? d.at.x - c.x : 0
    const dy = c ? d.at.y - c.y : -1
    const L = Math.hypot(dx, dy) || 1
    exits.push({ at: d.at, dir: { x: dx / L, y: dy / L }, kind: d.exit ?? "emergency" })
  }

  const stairExits: EvacuationPlan["stairExits"] = []
  for (const [roomId, at] of stairPoint) {
    const c = centre.get(roomId)
    const dx = c ? at.x - c.x : 0
    const dy = c ? at.y - c.y : -1
    const L = Math.hypot(dx, dy) || 1
    stairExits.push({ at, dir: { x: dx / L, y: dy / L } })
  }

  const stairs = floor.stairs
    .filter((s) => s.shape !== "column" && s.shape !== "porch" && s.shape !== "ramp")
    .map((s) => stairHoleWorld(s, floor.height))

  // помещения общего пользования в тупиках не считаем ошибкой
  // огнетушитель у каждого выхода — внутри здания, в 900 мм от двери
  // огнетушитель ставим и у выхода на лестницу: на верхних этажах это и есть
  // эвакуационный выход
  const extinguishers = [
    ...exits.map((e) => ({ x: e.at.x - e.dir.x * 900, y: e.at.y - e.dir.y * 900 })),
    ...(exits.length ? [] : stairExits.map((e) => ({ x: e.at.x - e.dir.x * 1200, y: e.at.y - e.dir.y * 1200 }))),
  ]

  return { routes, exits, stairExits, stairs, extinguishers, isolated: isolated.filter((id) => {
    const r = rooms.find((x) => x.id === id)
    return r ? roomUse(floor, r) === "rent" : false
  }) }
}
