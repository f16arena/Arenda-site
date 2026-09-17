// ADR: Помещения — ПРОИЗВОДНЫЕ от графа стен (§4.2–4.3). Извлекаем грани планарного
// графа обходом полу-рёбер: в каждом узле следующий полу-ребро — ближайшее по часовой
// от входящего. Внутренние грани (CCW, площадь>0) = комнаты; внешняя грань (CW) и
// «усы» отбрасываются. id комнаты стабилен по набору узлов (для привязки premise).

import type { WallGraph } from "./wall-graph"
import { type Vec2, centroid, pointInPolygon, polygonArea, signedArea } from "./math"

export interface Room {
  id: string
  nodeLoop: string[] // узлы контура по порядку
  polygon: Vec2[] // мм
  /** площадь за вычетом вложенных помещений (островов стен внутри), мм² */
  areaMm2: number
  /** контуры вложенных помещений — не входят в площадь (санузлы посреди коридора) */
  holes?: Vec2[][]
  floorMaterialId?: string
  premiseId?: string
}

const MIN_ROOM_AREA = 100 * 100 // 0.01 м² — отсекаем мусорные грани

function roomId(nodeLoop: string[]): string {
  const key = [...nodeLoop].sort().join("-")
  // короткий детерминированный хэш набора узлов
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return `room_${(h >>> 0).toString(36)}`
}

export function detectRooms(graph: WallGraph): Room[] {
  const nodes = graph.nodes
  const edges = Object.values(graph.edges)
  if (edges.length === 0) return []

  // Список соседей с углами направления узел→сосед.
  const neighbors = new Map<string, Array<{ to: string; angle: number }>>()
  const ensure = (id: string) => {
    let arr = neighbors.get(id)
    if (!arr) {
      arr = []
      neighbors.set(id, arr)
    }
    return arr
  }
  for (const e of edges) {
    const a = nodes[e.a]
    const b = nodes[e.b]
    if (!a || !b) continue
    ensure(e.a).push({ to: e.b, angle: Math.atan2(b.y - a.y, b.x - a.x) })
    ensure(e.b).push({ to: e.a, angle: Math.atan2(a.y - b.y, a.x - b.x) })
  }
  for (const arr of neighbors.values()) arr.sort((p, q) => p.angle - q.angle)

  // Следующее полу-ребро грани: в узле v приходим из u, идём к соседу,
  // непосредственно по часовой от направления v→u.
  const nextHalfEdge = (u: string, v: string): { from: string; to: string } | null => {
    const arr = neighbors.get(v)
    if (!arr || arr.length === 0) return null
    const k = arr.findIndex((n) => n.to === u)
    if (k < 0) return null
    const next = arr[(k - 1 + arr.length) % arr.length]
    return { from: v, to: next.to }
  }

  const visited = new Set<string>()
  const key = (from: string, to: string) => `${from}>${to}`
  const rooms: Room[] = []

  for (const e of edges) {
    for (const [s, t] of [[e.a, e.b], [e.b, e.a]] as const) {
      if (visited.has(key(s, t))) continue
      const loop: string[] = []
      let from = s
      let to = t
      let guard = 0
      let ok = true
      while (guard++ < 100000) {
        visited.add(key(from, to))
        loop.push(from)
        const nxt = nextHalfEdge(from, to)
        if (!nxt) {
          ok = false
          break
        }
        from = nxt.from
        to = nxt.to
        if (from === s && to === t) break
      }
      if (!ok || loop.length < 3) continue
      const polygon = loop.map((id) => ({ x: nodes[id].x, y: nodes[id].y }))
      if (signedArea(polygon) <= 0) continue // внешняя грань (CW) — не комната
      const areaMm2 = polygonArea(polygon)
      if (areaMm2 < MIN_ROOM_AREA) continue
      rooms.push({ id: roomId(loop), nodeLoop: loop, polygon, areaMm2 })
    }
  }
  return subtractIslands(rooms)
}

/** Точка строго внутри многоугольника (центр тяжести или середина ребра, сдвинутая внутрь). */
function interiorPoint(poly: Vec2[]): Vec2 {
  const c = centroid(poly)
  if (pointInPolygon(c, poly)) return c
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length]
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
    // многоугольник CCW: внутрь — влево от ребра
    const q = { x: m.x - ((b.y - a.y) / L) * 10, y: m.y + ((b.x - a.x) / L) * 10 }
    if (pointInPolygon(q, poly)) return q
  }
  return c
}

/**
 * Остров стен внутри помещения (блок санузлов посреди коридора) не связан с его
 * контуром, и грань помещения его накрывает: площадь коридора включала санузлы.
 * Помещение без общих узлов, лежащее внутри другого, вычитается из его площади
 * (только прямые вложения — остров в острове не вычитается дважды).
 */
function subtractIslands(rooms: Room[]): Room[] {
  if (rooms.length < 2) return rooms
  const nodeSets = rooms.map((r) => new Set(r.nodeLoop))
  const inside = (inner: number, outer: number) =>
    inner !== outer &&
    rooms[inner].areaMm2 < rooms[outer].areaMm2 &&
    !rooms[inner].nodeLoop.some((n) => nodeSets[outer].has(n)) &&
    pointInPolygon(interiorPoint(rooms[inner].polygon), rooms[outer].polygon)
  return rooms.map((r, oi) => {
    const kids = rooms.map((_, i) => i).filter((i) => inside(i, oi))
    // прямые вложения: не лежат внутри другого вложения этого же помещения
    const direct = kids.filter((i) => !kids.some((j) => j !== i && inside(i, j)))
    if (!direct.length) return r
    const holeArea = direct.reduce((sum, i) => sum + rooms[i].areaMm2, 0)
    return { ...r, areaMm2: Math.max(0, r.areaMm2 - holeArea), holes: direct.map((i) => rooms[i].polygon) }
  })
}
