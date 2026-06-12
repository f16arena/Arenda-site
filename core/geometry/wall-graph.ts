// ADR: Стена — НЕ пара точек, а ребро планарного графа с общими узлами (§4.2 ТЗ).
// Двигаешь узел — все примыкающие стены следуют. Вставка стены делает snap к
// существующим узлам, разбивает пересекаемые рёбра и саму стену на сегменты.
// Чистые функции (возвращают новый граф), без Babylon/React — тестируемо и worker-ready.

import { uid } from "@/core/id"
import {
  type Vec2,
  closestOnSegment,
  distance,
  segmentIntersection,
} from "./math"

export type WallKind = "exterior" | "interior" | "partition"

export interface GraphNode {
  id: string
  x: number // мм
  y: number // мм
}

export interface WallEdge {
  id: string
  a: string // nodeId
  b: string // nodeId
  thickness: number // мм
  height: number // мм
  kind: WallKind
  facadeMaterialId?: string
  interiorMaterialId?: string
}

export interface WallGraph {
  nodes: Record<string, GraphNode>
  edges: Record<string, WallEdge>
}

export interface WallDefaults {
  thickness: number
  height: number
  kind: WallKind
}

export const DEFAULT_WALL: WallDefaults = { thickness: 200, height: 3200, kind: "interior" }

export function emptyGraph(): WallGraph {
  return { nodes: {}, edges: {} }
}

export function cloneGraph(g: WallGraph): WallGraph {
  const nodes: Record<string, GraphNode> = {}
  const edges: Record<string, WallEdge> = {}
  for (const id in g.nodes) nodes[id] = { ...g.nodes[id] }
  for (const id in g.edges) edges[id] = { ...g.edges[id] }
  return { nodes, edges }
}

export function nodePos(g: WallGraph, id: string): Vec2 {
  const n = g.nodes[id]
  return { x: n.x, y: n.y }
}

export function nodeEdges(g: WallGraph, nodeId: string): WallEdge[] {
  return Object.values(g.edges).filter((e) => e.a === nodeId || e.b === nodeId)
}

/** Снап к существующему узлу в радиусе tol; иначе создание нового. Мутирует g. */
function getOrCreateNodeAt(g: WallGraph, p: Vec2, tol: number): string {
  for (const id in g.nodes) {
    const n = g.nodes[id]
    if (distance(p, n) <= tol) return id
  }
  const id = uid("n")
  g.nodes[id] = { id, x: p.x, y: p.y }
  return id
}

/** Разбить ребро в точке: удалить, добавить узел и два ребра с теми же свойствами. */
function splitEdgeAt(g: WallGraph, edgeId: string, p: Vec2): string {
  const e = g.edges[edgeId]
  const nodeId = getOrCreateNodeAt(g, p, 0.5)
  if (nodeId === e.a || nodeId === e.b) return nodeId
  delete g.edges[edgeId]
  const base = { thickness: e.thickness, height: e.height, kind: e.kind, facadeMaterialId: e.facadeMaterialId, interiorMaterialId: e.interiorMaterialId }
  const e1 = uid("w")
  const e2 = uid("w")
  g.edges[e1] = { id: e1, a: e.a, b: nodeId, ...base }
  g.edges[e2] = { id: e2, a: nodeId, b: e.b, ...base }
  return nodeId
}

/** Точку привязываем к узлу, либо к лежащему рядом ребру (с разбиением), либо новый узел. */
function resolvePoint(g: WallGraph, p: Vec2, tol: number): string {
  for (const id in g.nodes) {
    if (distance(p, g.nodes[id]) <= tol) return id
  }
  // на ребре?
  let bestEdge: string | null = null
  let bestDist = tol
  let bestPoint: Vec2 = p
  for (const id in g.edges) {
    const e = g.edges[id]
    const c = closestOnSegment(p, g.nodes[e.a], g.nodes[e.b])
    if (c.t > 0.01 && c.t < 0.99 && c.dist < bestDist) {
      bestDist = c.dist
      bestEdge = id
      bestPoint = c.point
    }
  }
  if (bestEdge) return splitEdgeAt(g, bestEdge, bestPoint)
  return getOrCreateNodeAt(g, p, 0)
}

function edgeExists(g: WallGraph, a: string, b: string): boolean {
  for (const id in g.edges) {
    const e = g.edges[id]
    if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return true
  }
  return false
}

function addEdge(g: WallGraph, a: string, b: string, def: WallDefaults): string | null {
  if (a === b || edgeExists(g, a, b)) return null
  const id = uid("w")
  g.edges[id] = { id, a, b, thickness: def.thickness, height: def.height, kind: def.kind }
  return id
}

/**
 * Вставить стену p1→p2: снап концов к узлам/рёбрам, разбиение пересечений с
 * существующими рёбрами, разбиение самой стены на сегменты между пересечениями.
 * Возвращает новый граф и id созданных рёбер.
 */
export function insertWall(
  graph: WallGraph,
  p1: Vec2,
  p2: Vec2,
  def: WallDefaults = DEFAULT_WALL,
  tol = 1,
): { graph: WallGraph; edgeIds: string[] } {
  const g = cloneGraph(graph)
  if (distance(p1, p2) < Math.max(tol, 1)) return { graph, edgeIds: [] }

  const startId = resolvePoint(g, p1, tol)
  const endId = resolvePoint(g, p2, tol)

  // Пересечения новой стены с существующими рёбрами (снимок до разбиений).
  const snapshot = Object.values(g.edges).map((e) => ({ id: e.id, a: { ...g.nodes[e.a] }, b: { ...g.nodes[e.b] } }))
  const hits: Array<{ t: number; point: Vec2; edgeId: string }> = []
  for (const e of snapshot) {
    const hit = segmentIntersection(p1, p2, e.a, e.b)
    if (hit) hits.push({ t: hit.t, point: hit.point, edgeId: e.id })
  }
  hits.sort((h1, h2) => h1.t - h2.t)

  const sequence: string[] = [startId]
  for (const h of hits) {
    if (!g.edges[h.edgeId]) continue // ребро уже разбито совпавшей точкой
    const nid = splitEdgeAt(g, h.edgeId, h.point)
    if (sequence[sequence.length - 1] !== nid) sequence.push(nid)
  }
  if (sequence[sequence.length - 1] !== endId) sequence.push(endId)

  const edgeIds: string[] = []
  for (let i = 0; i < sequence.length - 1; i++) {
    const id = addEdge(g, sequence[i], sequence[i + 1], def)
    if (id) edgeIds.push(id)
  }
  return { graph: g, edgeIds }
}

/** Глубокая копия графа со свежими id (для копирования плана этажа на новый). */
export function remapGraph(graph: WallGraph): WallGraph {
  const idMap = new Map<string, string>()
  const nodes: Record<string, GraphNode> = {}
  for (const id in graph.nodes) {
    const nid = uid("n")
    idMap.set(id, nid)
    nodes[nid] = { ...graph.nodes[id], id: nid }
  }
  const edges: Record<string, WallEdge> = {}
  for (const id in graph.edges) {
    const e = graph.edges[id]
    const eid = uid("w")
    edges[eid] = { ...e, id: eid, a: idMap.get(e.a) ?? e.a, b: idMap.get(e.b) ?? e.b }
  }
  return { nodes, edges }
}

/** Переместить узел; все примыкающие стены следуют автоматически (общий узел). */
export function moveNode(graph: WallGraph, nodeId: string, x: number, y: number): WallGraph {
  if (!graph.nodes[nodeId]) return graph
  const g = cloneGraph(graph)
  g.nodes[nodeId] = { ...g.nodes[nodeId], x, y }
  return g
}

/** Удалить ребро; узлы, оставшиеся без рёбер, удаляются. */
export function removeEdge(graph: WallGraph, edgeId: string): WallGraph {
  if (!graph.edges[edgeId]) return graph
  const g = cloneGraph(graph)
  const { a, b } = g.edges[edgeId]
  delete g.edges[edgeId]
  for (const nid of [a, b]) {
    if (nodeEdges(g, nid).length === 0) delete g.nodes[nid]
  }
  return g
}
