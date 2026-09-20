// План эвакуации (ГОСТ Р 12.2.143, ГОСТ 12.4.026): пути от каждого помещения
// к ближайшему выходу наружу, знаки выходов, лестницы и первичные средства
// пожаротушения. Путь строится по дверям: помещение → дверь → соседнее
// помещение, поиск в ширину до двери наружу, без прохода сквозь стены.

import type { Floor } from "@/types/builder"
import { floorRooms, type FloorRoom } from "@/lib/builder/rooms"
import { labelPoint } from "./floor-drawing"
import { pointInPolygon, segmentIntersection, type Vec2 } from "@/core/geometry/math"
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

  // Путь внутри помещения. Раньше: если Г-образный ход не помещался, линия шла
  // напрямую и резала стены (L-образные коридоры, обход лестничной клетки).
  // Теперь: 1) прямая, если она внутри; 2) Г-образный ход; 3) обход по углам
  // помещения (кратчайший путь внутри многоугольника).
  const roomById = new Map(rooms.map((r) => [r.id, r]))
  const insideAt = (p: Vec2, room: FloorRoom) =>
    pointInPolygon(p, room.polygon) && !(room.holes ?? []).some((h) => pointInPolygon(p, h))
  /** Отрезок целиком внутри помещения (не пересекает стены и не идёт через вырез). */
  const segInside = (a: Vec2, b: Vec2, room: FloorRoom): boolean => {
    const rings = [room.polygon, ...(room.holes ?? [])]
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i]
        const q = ring[(i + 1) % ring.length]
        if (segmentIntersection(a, b, p, q)) return false
      }
    }
    // середина и четверти — отсекает ход «снаружи вдоль стены» и через вырез
    for (const t of [0.25, 0.5, 0.75]) {
      const m = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      if (!insideAt(m, room)) return false
    }
    return true
  }
  /** Углы помещения, сдвинутые внутрь — точки обхода. */
  const cornerNodes = (room: FloorRoom): Vec2[] => {
    const out: Vec2[] = []
    const rings = [room.polygon, ...(room.holes ?? [])]
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const prevP = ring[(i - 1 + ring.length) % ring.length]
        const p = ring[i]
        const nextP = ring[(i + 1) % ring.length]
        const d1 = { x: p.x - prevP.x, y: p.y - prevP.y }
        const d2 = { x: nextP.x - p.x, y: nextP.y - p.y }
        const l1 = Math.hypot(d1.x, d1.y) || 1
        const l2 = Math.hypot(d2.x, d2.y) || 1
        // биссектриса внутрь: пробуем обе стороны, берём ту, что внутри
        const bx = d1.x / l1 - d2.x / l2
        const by = d1.y / l1 - d2.y / l2
        const bl = Math.hypot(bx, by) || 1
        for (const sgn of [1, -1]) {
          const c = { x: p.x + (bx / bl) * 700 * sgn, y: p.y + (by / bl) * 700 * sgn }
          if (insideAt(c, room)) { out.push(c); break }
        }
      }
    }
    return out
  }
  /** Кратчайший путь a→b внутри помещения по углам (без точки a). */
  const pathInside = (a: Vec2, b: Vec2, room: FloorRoom | undefined): Vec2[] => {
    if (!room) return [b]
    if (segInside(a, b, room)) {
      // предпочитаем ход под прямым углом — так читается на чертеже
      for (const k of [{ x: a.x, y: b.y }, { x: b.x, y: a.y }]) {
        if (insideAt(k, room) && segInside(a, k, room) && segInside(k, b, room)) return [k, b]
      }
      return [b]
    }
    for (const k of [{ x: a.x, y: b.y }, { x: b.x, y: a.y }]) {
      if (insideAt(k, room) && segInside(a, k, room) && segInside(k, b, room)) return [k, b]
    }
    // обход по углам: Дейкстра на видимых точках
    const nodes: Vec2[] = [a, b, ...cornerNodes(room)]
    const N = nodes.length
    const vis = (i: number, j: number) => segInside(nodes[i], nodes[j], room)
    const dst = new Array<number>(N).fill(Infinity)
    const from = new Array<number>(N).fill(-1)
    const used = new Array<boolean>(N).fill(false)
    dst[0] = 0
    for (let step = 0; step < N; step++) {
      let cur = -1
      for (let i = 0; i < N; i++) if (!used[i] && dst[i] < (cur === -1 ? Infinity : dst[cur])) cur = i
      if (cur === -1) break
      used[cur] = true
      if (cur === 1) break
      for (let j = 0; j < N; j++) {
        if (used[j] || !vis(cur, j)) continue
        const w = Math.hypot(nodes[j].x - nodes[cur].x, nodes[j].y - nodes[cur].y)
        if (dst[cur] + w < dst[j]) { dst[j] = dst[cur] + w; from[j] = cur }
      }
    }
    if (!Number.isFinite(dst[1])) return [b] // пути нет — оставляем прямую
    const chain: Vec2[] = []
    for (let i = 1; i !== 0 && i !== -1; i = from[i]) chain.push(nodes[i])
    return chain.reverse()
  }
  const polyOf = (id: string | undefined) => roomById.get(id ?? "")
  const routes: Vec2[][] = []
  const isolated: string[] = []
  for (const r of rooms) {
    const c = centre.get(r.id)
    if (!c) continue
    if (!dist.has(r.id)) { isolated.push(r.id); continue }
    const path: Vec2[] = [c]
    const go = (to: Vec2, roomId: string) => {
      const from = path[path.length - 1]
      for (const p of pathInside(from, to, polyOf(roomId))) path.push(p)
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
