import { describe, expect, it } from "vitest"
import { emptyGraph, insertWall } from "@/core/geometry/wall-graph"
import { InsertWallCommand, DeleteWallCommand, TransformWallsCommand, findFloor } from "@/core/document/commands"
import { buildEmptyProject } from "./demo-project"
import { openingCenter, transformWalls } from "./wall-transform"
import type { BuilderDocument, Floor } from "@/types/builder"

function room(): Floor {
  let g = emptyGraph()
  const pts = [[0, 0], [6000, 0], [6000, 4000], [0, 4000], [0, 0]]
  for (let i = 0; i < 4; i++) g = insertWall(g, { x: pts[i][0], y: pts[i][1] }, { x: pts[i + 1][0], y: pts[i + 1][1] }, { thickness: 200, height: 3000, kind: "interior" }).graph
  const bottom = Object.values(g.edges).find((e) => g.nodes[e.a].y === 0 && g.nodes[e.b].y === 0)!
  const ax = g.nodes[bottom.a].x
  return {
    id: "f", name: "1", level: 1, elevation: 0, height: 3000, visible: true, locked: false, opacity: 1, wallGraph: g,
    // дверь с центром в x = 1500
    openings: [{ id: "d1", wallId: bottom.id, type: "door", variant: "single", width: 900, height: 2100, sillHeight: 0, offset: ax === 0 ? 1500 : 4500 }],
    stairs: [], objects: [], premiseLinks: {}, roomMaterials: {}, mepRuns: [], mepDevices: [],
  }
}

function docWith(f: Floor): BuilderDocument {
  const doc = buildEmptyProject()
  return { ...doc, buildings: [{ ...doc.buildings[0], floors: [f] }] }
}

describe("проёмы при перестройке стен", () => {
  it("перегородка, примкнувшая к стене с дверью, не уничтожает дверь", () => {
    const f = room()
    const cmd = new InsertWallCommand("f", { x: 3000, y: 0 }, { x: 3000, y: 4000 }, { thickness: 100, height: 3000, kind: "partition" })
    const d1 = cmd.apply(docWith(f))
    const f1 = findFloor(d1, "f")!
    expect(f1.openings).toHaveLength(1)
    const c = openingCenter(f1.wallGraph, f1.openings[0])!
    expect(c.x).toBeCloseTo(1500)
    expect(c.y).toBeCloseTo(0)
    // откат возвращает и граф, и привязку
    expect(findFloor(cmd.revert(d1), "f")!.openings[0].wallId).toBe(f.openings[0].wallId)
  })

  it("удаление стены убирает её проёмы и возвращает при откате", () => {
    const f = room()
    const cmd = new DeleteWallCommand("f", f.openings[0].wallId)
    const d1 = cmd.apply(docWith(f))
    expect(findFloor(d1, "f")!.openings).toHaveLength(0)
    expect(findFloor(cmd.revert(d1), "f")!.openings).toHaveLength(1)
  })
})

describe("групповые операции со стенами", () => {
  const all = (f: Floor) => Object.keys(f.wallGraph.edges)

  it("сдвиг комнаты: стены и дверь уезжают на 10 м", () => {
    const f = room()
    const r = transformWalls(f, all(f), { kind: "move", dx: 10000, dy: 0 }, false)
    const xs = Object.values(r.wallGraph.nodes).map((n) => n.x)
    expect(Math.min(...xs)).toBe(10000)
    expect(r.openings).toHaveLength(1)
    expect(openingCenter(r.wallGraph, r.openings[0])!.x).toBeCloseTo(11500)
    expect(r.openings[0].id).toBe("d1")
  })

  it("копия: исходная комната остаётся, у копии своя дверь", () => {
    const f = room()
    const cmd = new TransformWallsCommand("f", all(f), { kind: "move", dx: 0, dy: 8000 }, true)
    const d1 = cmd.apply(docWith(f))
    const f1 = findFloor(d1, "f")!
    expect(Object.keys(f1.wallGraph.edges)).toHaveLength(8)
    expect(f1.openings).toHaveLength(2)
    expect(new Set(f1.openings.map((o) => o.id)).size).toBe(2)
    expect(cmd.createdIds).toHaveLength(4)
    expect(Object.keys(findFloor(cmd.revert(d1), "f")!.wallGraph.edges)).toHaveLength(4)
  })

  it("поворот на 90° вокруг центра: 6×4 становится 4×6", () => {
    const f = room()
    const r = transformWalls(f, all(f), { kind: "rotate", deg: 90 }, false)
    const xs = Object.values(r.wallGraph.nodes).map((n) => n.x), ys = Object.values(r.wallGraph.nodes).map((n) => n.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4000)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(6000)
    expect(r.openings).toHaveLength(1)
  })

  it("зеркало по вертикальной оси: дверь переходит на другую сторону", () => {
    const f = room()
    const r = transformWalls(f, all(f), { kind: "mirror", axis: "vertical" }, false)
    expect(openingCenter(r.wallGraph, r.openings[0])!.x).toBeCloseTo(4500)
  })
})
