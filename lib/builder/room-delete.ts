// Удаление помещения в конструкторе. Помещение — это не отдельный объект, а
// контур, замкнутый стенами. Удалить его — значит убрать стены контура, кроме
// тех, что делит с соседними помещениями: иначе сносится и соседняя комната.

import type { WallGraph } from "@/core/geometry/wall-graph"
import { detectRooms } from "@/core/geometry/room-detection"

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** id стен, которые нужно снести, чтобы помещения не стало (общие с соседями остаются). */
export function roomWallsToDelete(graph: WallGraph, roomId: string): string[] {
  const rooms = detectRooms(graph)
  const target = rooms.find((r) => r.id === roomId)
  if (!target) return []
  const usage = new Map<string, number>()
  for (const room of rooms) {
    const loop = room.nodeLoop
    for (let i = 0; i < loop.length; i++) {
      const key = pairKey(loop[i], loop[(i + 1) % loop.length])
      usage.set(key, (usage.get(key) ?? 0) + 1)
    }
  }
  const edgeByPair = new Map<string, string>()
  for (const id in graph.edges) {
    const e = graph.edges[id]
    edgeByPair.set(pairKey(e.a, e.b), id)
  }
  const out: string[] = []
  const loop = target.nodeLoop
  for (let i = 0; i < loop.length; i++) {
    const key = pairKey(loop[i], loop[(i + 1) % loop.length])
    if ((usage.get(key) ?? 0) > 1) continue // общая стена с соседним помещением
    const id = edgeByPair.get(key)
    if (id) out.push(id)
  }
  return out
}
