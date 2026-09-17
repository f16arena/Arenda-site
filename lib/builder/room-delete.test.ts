import { describe, expect, it } from "vitest"
import { emptyGraph, insertWall } from "@/core/geometry/wall-graph"
import { detectRooms } from "@/core/geometry/room-detection"
import { roomWallsToDelete } from "./room-delete"

/** Две комнаты 4×3 м через общую стену по x = 4000. */
function twoRooms() {
  let g = emptyGraph()
  const seg = (a: [number, number], b: [number, number]) => {
    g = insertWall(g, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }).graph
  }
  seg([0, 0], [8000, 0])
  seg([8000, 0], [8000, 3000])
  seg([8000, 3000], [0, 3000])
  seg([0, 3000], [0, 0])
  seg([4000, 0], [4000, 3000])
  return g
}

describe("удаление помещения", () => {
  it("сносит стены контура, общую с соседом оставляет", () => {
    const g = twoRooms()
    const rooms = detectRooms(g)
    expect(rooms).toHaveLength(2)
    const left = rooms.find((r) => r.polygon.every((p) => p.x <= 4000))!
    const ids = roomWallsToDelete(g, left.id)
    expect(ids).toHaveLength(3)
    const shared = Object.values(g.edges).find((e) => g.nodes[e.a].x === 4000 && g.nodes[e.b].x === 4000)!
    expect(ids).not.toContain(shared.id)
  })

  it("неизвестное помещение — ничего не сносит", () => {
    expect(roomWallsToDelete(twoRooms(), "нет-такого")).toEqual([])
  })
})
