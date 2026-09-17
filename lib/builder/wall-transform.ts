// Групповые операции со стенами (как MOVE/COPY/ROTATE/MIRROR в AutoCAD) и
// перепривязка проёмов, когда граф стен перестроился.
//
// Стены в графе делятся при примыканиях: у проёма на разделённой стене
// пропадал wallId, и дверь или окно молча исчезали. remapOpenings находит для
// такого проёма новую часть стены по его центру и пересчитывает смещение.

import type { Floor, Opening } from "@/types/builder"
import { closestOnSegment, type Vec2 } from "@/core/geometry/math"
import { insertWall, removeEdge, type WallGraph } from "@/core/geometry/wall-graph"
import { uid } from "@/core/id"

/** Центр проёма в плане по графу, где он был привязан. */
export function openingCenter(g: WallGraph, o: Opening): Vec2 | null {
  const e = g.edges[o.wallId]
  const a = e && g.nodes[e.a], b = e && g.nodes[e.b]
  if (!e || !a || !b) return null
  const L = Math.hypot(b.x - a.x, b.y - a.y)
  if (L < 1) return null
  return { x: a.x + ((b.x - a.x) / L) * o.offset, y: a.y + ((b.y - a.y) / L) * o.offset }
}

/** Ребро нового графа, на котором лежит точка (в пределах tol мм), и смещение вдоль него. */
function attach(g: WallGraph, p: Vec2, tol: number, only?: Set<string>): { wallId: string; offset: number } | null {
  let best: { wallId: string; offset: number; d: number } | null = null
  for (const id in g.edges) {
    if (only && !only.has(id)) continue
    const e = g.edges[id]
    const a = g.nodes[e.a], b = g.nodes[e.b]
    if (!a || !b) continue
    const c = closestOnSegment(p, a, b)
    if (c.dist > tol || (best && c.dist >= best.d)) continue
    best = { wallId: id, offset: c.t * Math.hypot(b.x - a.x, b.y - a.y), d: c.dist }
  }
  return best ? { wallId: best.wallId, offset: best.offset } : null
}

/**
 * Проёмы, чья стена исчезла из графа (разделена), перепривязываются к части
 * стены, на которой лежит их центр. Не нашли — проём убирается, а не висит
 * невидимым в документе.
 */
export function remapOpenings(prev: WallGraph, next: WallGraph, openings: Opening[]): Opening[] {
  let changed = false
  const out: Opening[] = []
  for (const o of openings) {
    if (next.edges[o.wallId]) {
      out.push(o)
      continue
    }
    changed = true
    const c = openingCenter(prev, o)
    const hit = c ? attach(next, c, 5) : null
    if (hit) out.push({ ...o, wallId: hit.wallId, offset: hit.offset })
  }
  return changed ? out : openings
}

export type WallXf =
  | { kind: "move"; dx: number; dy: number }
  | { kind: "rotate"; deg: number }
  | { kind: "mirror"; axis: "vertical" | "horizontal" }

function makeApply(g: WallGraph, ids: string[], xf: WallXf): (p: Vec2) => Vec2 {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const id of ids) {
    const e = g.edges[id]
    for (const n of [g.nodes[e.a], g.nodes[e.b]]) {
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x)
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y)
    }
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  if (xf.kind === "move") return (p) => ({ x: p.x + xf.dx, y: p.y + xf.dy })
  if (xf.kind === "mirror") return (p) => (xf.axis === "vertical" ? { x: 2 * cx - p.x, y: p.y } : { x: p.x, y: 2 * cy - p.y })
  const r = (xf.deg * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r)
  return (p) => ({ x: cx + (p.x - cx) * cos - (p.y - cy) * sin, y: cy + (p.x - cx) * sin + (p.y - cy) * cos })
}

export interface WallTransformResult {
  wallGraph: WallGraph
  openings: Opening[]
  /** рёбра, получившиеся из выбранных стен (для нового выделения) */
  edgeIds: string[]
}

/** Сдвинуть, повернуть или отразить стены (copy — оставить исходные). Проёмы едут вместе со стенами. */
export function transformWalls(floor: Pick<Floor, "wallGraph" | "openings">, edgeIds: string[], xf: WallXf, copy: boolean): WallTransformResult {
  const g0 = floor.wallGraph
  const ids = edgeIds.filter((id) => g0.edges[id])
  if (!ids.length) return { wallGraph: g0, openings: floor.openings, edgeIds: [] }
  const apply = makeApply(g0, ids, xf)
  const segs = ids.map((id) => {
    const e = g0.edges[id]
    return {
      e,
      a: apply(g0.nodes[e.a]),
      b: apply(g0.nodes[e.b]),
      ops: floor.openings.filter((o) => o.wallId === id).map((o) => ({ o, c: openingCenter(g0, o) })),
    }
  })

  let g = g0
  let openings = floor.openings
  if (!copy) {
    for (const id of ids) g = removeEdge(g, id)
    openings = openings.filter((o) => !ids.includes(o.wallId))
  }
  // оставшиеся проёмы могли сидеть на стенах, которые делятся новыми примыканиями
  const created: string[] = []
  const moved: Opening[] = []
  for (const s of segs) {
    const before = g
    const { graph, edgeIds: made } = insertWall(g, s.a, s.b, { thickness: s.e.thickness, height: s.e.height, kind: s.e.kind, phase: s.e.phase })
    g = graph
    openings = remapOpenings(before, g, openings)
    for (const id of made) {
      const { facadeMaterialId, interiorMaterialId } = s.e
      g.edges[id] = { ...g.edges[id], ...(facadeMaterialId ? { facadeMaterialId } : {}), ...(interiorMaterialId ? { interiorMaterialId } : {}) }
    }
    created.push(...made)
    const mine = new Set(made)
    for (const { o, c } of s.ops) {
      if (!c) continue
      const hit = attach(g, apply(c), 5, mine)
      if (hit) moved.push({ ...o, id: copy ? uid("op") : o.id, wallId: hit.wallId, offset: hit.offset })
    }
  }
  // проёмы, перенесённые раньше, могли оказаться на стенах, разделённых следующими вставками
  const all = [...openings, ...moved]
  const fixed: Opening[] = []
  for (const o of all) {
    if (g.edges[o.wallId]) fixed.push(o)
  }
  return { wallGraph: g, openings: fixed.length === all.length ? all : fixed, edgeIds: created.filter((id) => g.edges[id]) }
}
