// Перепланировка: одна модель этажа хранит и «было», и «стало». У стены и проёма
// есть метка phase: нет метки — существующее, "demolish" — демонтируется,
// "new" — возводится. Из этого выводятся обмерный план, план демонтажа,
// план монтажа, итоговый план и сравнение площадей.

import { floorRooms } from "@/lib/builder/rooms"
import type { Floor, Opening } from "@/types/builder"
import type { WallGraph } from "@/core/geometry/wall-graph"
import { centroid, pointInPolygon } from "@/core/geometry/math"

export type Phase = "demolish" | "new"
export type Stage = "before" | "after"

export function hasReplan(floor: Pick<Floor, "wallGraph" | "openings">): boolean {
  return Object.values(floor.wallGraph.edges).some((e) => e.phase) || floor.openings.some((o) => o.phase)
}

/** Граф на стадии: «было» — без новых стен, «стало» — без демонтируемых. */
export function phaseGraph(g: WallGraph, stage: Stage): WallGraph {
  const drop = stage === "before" ? "new" : "demolish"
  const edges: WallGraph["edges"] = {}
  const used = new Set<string>()
  for (const id in g.edges) {
    const e = g.edges[id]
    if (e.phase === drop) continue
    edges[id] = e
    used.add(e.a)
    used.add(e.b)
  }
  const nodes: WallGraph["nodes"] = {}
  for (const id of used) if (g.nodes[id]) nodes[id] = g.nodes[id]
  return { nodes, edges }
}

export function phaseOpenings(openings: Opening[], g: WallGraph, stage: Stage): Opening[] {
  const drop = stage === "before" ? "new" : "demolish"
  return openings.filter((o) => o.phase !== drop && g.edges[o.wallId])
}

export function floorAtStage<F extends Floor>(floor: F, stage: Stage): F {
  const wallGraph = phaseGraph(floor.wallGraph, stage)
  return { ...floor, wallGraph, openings: phaseOpenings(floor.openings, wallGraph, stage) }
}

export interface RoomChange {
  /** площадь «стало», м² (null — помещение исчезло) */
  after: number | null
  /** площадь «было», м² (null — новое помещение) */
  before: number | null
  at: { x: number; y: number }
}

export interface ReplanSummary {
  demolishWallM: number
  newWallM: number
  openingsNew: number
  openingsClosed: number
  areaBefore: number
  areaAfter: number
  rooms: RoomChange[]
}

function wallLength(g: WallGraph, phase: Phase): number {
  let L = 0
  for (const id in g.edges) {
    const e = g.edges[id]
    if (e.phase !== phase) continue
    const a = g.nodes[e.a], b = g.nodes[e.b]
    if (a && b) L += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return L / 1000
}

const r1 = (x: number) => Math.round(x * 10) / 10

/**
 * Сравнение: помещения «стало» сопоставляются с «было» по точке внутри
 * (центр тяжести нового помещения попал в старое). Несопоставленные старые —
 * исчезнувшие (объединены или снесены).
 */
export function replanSummary(floor: Pick<Floor, "wallGraph" | "openings"> & Partial<Pick<Floor, "stairs" | "height">>): ReplanSummary {
  const before = floorRooms({ wallGraph: phaseGraph(floor.wallGraph, "before"), stairs: floor.stairs ?? [], height: floor.height ?? 3000 })
  const after = floorRooms({ wallGraph: phaseGraph(floor.wallGraph, "after"), stairs: floor.stairs ?? [], height: floor.height ?? 3000 })
  const matched = new Set<string>()
  const rooms: RoomChange[] = after.map((r) => {
    const c = centroid(r.polygon)
    const old = before.find((b) => !matched.has(b.id) && pointInPolygon(c, b.polygon))
    if (old) matched.add(old.id)
    return { after: r1(r.areaMm2 / 1e6), before: old ? r1(old.areaMm2 / 1e6) : null, at: c }
  })
  for (const b of before) if (!matched.has(b.id)) rooms.push({ after: null, before: r1(b.areaMm2 / 1e6), at: centroid(b.polygon) })
  rooms.sort((p, q) => q.at.y - p.at.y || p.at.x - q.at.x)
  return {
    demolishWallM: r1(wallLength(floor.wallGraph, "demolish")),
    newWallM: r1(wallLength(floor.wallGraph, "new")),
    openingsNew: floor.openings.filter((o) => o.phase === "new").length,
    openingsClosed: floor.openings.filter((o) => o.phase === "demolish").length,
    areaBefore: r1(before.reduce((s, r) => s + r.areaMm2, 0) / 1e6),
    areaAfter: r1(after.reduce((s, r) => s + r.areaMm2, 0) / 1e6),
    rooms,
  }
}
