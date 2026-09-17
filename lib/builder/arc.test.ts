import { describe, expect, it } from "vitest"
import { arcPoints, circumcenter } from "./arc"

describe("дуговая стена", () => {
  it("центр окружности через три точки", () => {
    const c = circumcenter({ x: -5000, y: 0 }, { x: 5000, y: 0 }, { x: 0, y: 5000 })
    expect(c?.x).toBeCloseTo(0, 6)
    expect(c?.y).toBeCloseTo(0, 6)
  })

  it("полуокружность проходит через заданную точку и лежит на радиусе", () => {
    const pts = arcPoints({ x: -5000, y: 0 }, { x: 5000, y: 0 }, { x: 0, y: 5000 })
    expect(pts[0]).toEqual({ x: -5000, y: 0 })
    expect(pts[pts.length - 1]).toEqual({ x: 5000, y: 0 })
    for (const p of pts) expect(Math.hypot(p.x, p.y)).toBeGreaterThan(4990)
    // вся дуга сверху (через точку y>0), а не снизу
    expect(pts.slice(1, -1).every((p) => p.y > 0)).toBe(true)
  })

  it("точка с другой стороны — дуга идёт вниз", () => {
    const pts = arcPoints({ x: -5000, y: 0 }, { x: 5000, y: 0 }, { x: 0, y: -2000 })
    expect(pts.slice(1, -1).every((p) => p.y < 0)).toBe(true)
  })

  it("точки на прямой — обычная стена", () => {
    expect(arcPoints({ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 3000, y: 5 })).toHaveLength(2)
  })
})

describe("участки дуги", () => {
  it("распознаются, а прямой угол комнаты — нет", async () => {
    const { arcSegmentIds } = await import("./arc")
    const pts = arcPoints({ x: -5000, y: 0 }, { x: 5000, y: 0 }, { x: 0, y: 5000 })
    const nodes: Record<string, { x: number; y: number }> = {}
    const edges: Record<string, { a: string; b: string }> = {}
    pts.forEach((p, i) => { nodes[`n${i}`] = p })
    for (let i = 0; i + 1 < pts.length; i++) edges[`e${i}`] = { a: `n${i}`, b: `n${i + 1}` }
    nodes.c1 = { x: -5600, y: 0 }
    edges.short = { a: "n0", b: "c1" } // короткая стена под прямым углом
    const ids = arcSegmentIds({ nodes, edges })
    expect(ids.size).toBe(pts.length - 1)
    expect(ids.has("short")).toBe(false)
  })
})
