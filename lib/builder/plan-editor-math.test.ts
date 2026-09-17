import { describe, expect, it } from "vitest"
import { emptyGraph, insertWall } from "@/core/geometry/wall-graph"
import type { Floor } from "@/types/builder"
import { fitView, hitTest, perpendicularDelta, snapPoint, toPlan, toScreen, zoomAt } from "./plan-editor-math"

function floor(): Floor {
  let g = emptyGraph()
  const pts = [[0, 0], [8000, 0], [8000, 5000], [0, 5000], [0, 0]]
  for (let i = 0; i < 4; i++) g = insertWall(g, { x: pts[i][0], y: pts[i][1] }, { x: pts[i + 1][0], y: pts[i + 1][1] }, { thickness: 300, height: 3000, kind: "exterior" }).graph
  const bottom = Object.values(g.edges).find((e) => g.nodes[e.a].y === 0 && g.nodes[e.b].y === 0)!
  return {
    id: "f", name: "1", level: 1, elevation: 0, height: 3000, visible: true, locked: false, opacity: 1, wallGraph: g,
    openings: [{ id: "d", wallId: bottom.id, type: "door", variant: "single", width: 1000, height: 2100, sillHeight: 0, offset: g.nodes[bottom.a].x === 0 ? 2000 : 6000 }],
    stairs: [{ id: "lift", shape: "elevator", fromFloorId: "f", toFloorId: "f", position: { x: 6000, y: 2000 }, rotationDeg: 0, width: 2000, railing: false }],
    objects: [], premiseLinks: {}, roomMaterials: {}, mepRuns: [], mepDevices: [],
  }
}

describe("редактор плана: вид", () => {
  it("экран ↔ план, ось Y вверх", () => {
    const v = { k: 0.1, tx: 100, ty: 500 }
    const s = toScreen(v, { x: 1000, y: 2000 })
    expect(s).toEqual({ x: 200, y: 300 })
    expect(toPlan(v, s)).toEqual({ x: 1000, y: 2000 })
  })
  it("вписать и зум вокруг курсора держат точку на месте", () => {
    const v = fitView({ minX: 0, minY: 0, maxX: 8000, maxY: 5000 }, 1000, 700)
    const c = toScreen(v, { x: 4000, y: 2500 })
    expect(c.x).toBeCloseTo(500)
    expect(c.y).toBeCloseTo(350)
    const z = zoomAt(v, { x: 300, y: 200 }, 2)
    const before = toPlan(v, { x: 300, y: 200 }), after = toPlan(z, { x: 300, y: 200 })
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })
})

describe("редактор плана: привязки и попадание", () => {
  it("узел → стена → угол 15° → сетка", () => {
    const f = floor()
    expect(snapPoint(f, { x: 60, y: -40 }, null, 100, true)).toEqual({ p: { x: 0, y: 0 }, kind: "node" })
    expect(snapPoint(f, { x: 3020, y: 70 }, null, 100, true)).toEqual({ p: { x: 3020, y: 0 }, kind: "edge" })
    const a = snapPoint(f, { x: 3000, y: 2520 }, { x: 1000, y: 2500 }, 100, true)
    expect(a.kind).toBe("angle")
    expect(a.p.y).toBe(2500)
    expect(snapPoint(f, { x: 3030, y: 2470 }, null, 100, true)).toEqual({ p: { x: 3000, y: 2500 }, kind: "grid" })
  })

  it("дверь важнее стены, лифт — по контуру шахты, внутри — помещение", () => {
    const f = floor()
    const tol = 80
    expect(hitTest(f, { x: 2100, y: 50 }, tol)?.kind).toBe("opening")
    expect(hitTest(f, { x: 4500, y: 50 }, tol)?.kind).toBe("wall")
    expect(hitTest(f, { x: 6000, y: 2500 }, tol)).toEqual({ kind: "stair", id: "lift" })
    expect(hitTest(f, { x: 2000, y: 3000 }, tol)?.kind).toBe("room")
    const bottom = f.openings[0].wallId
    const nodeId = f.wallGraph.edges[bottom].a
    const n = f.wallGraph.nodes[nodeId]
    expect(hitTest(f, { x: n.x + 30, y: n.y + 30 }, tol, [nodeId])).toEqual({ kind: "node", id: nodeId })
  })

  it("стена двигается только поперёк себя, с шагом", () => {
    expect(perpendicularDelta({ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 100, y: 0 }, { x: 900, y: 437 }, 50)).toEqual({ dx: 0, dy: 450 })
  })
})

describe("редактор плана: рамка", async () => {
  const { wallsInRect } = await import("./plan-editor-math")
  it("окно берёт стены целиком внутри, секущая — задетые", () => {
    const f = floor()
    const rect = { minX: -500, minY: -500, maxX: 8500, maxY: 2000 }
    expect(wallsInRect(f, rect, false)).toHaveLength(1) // только нижняя стена целиком
    expect(wallsInRect(f, rect, true).length).toBe(3) // нижняя + две боковые задеты
  })
})
