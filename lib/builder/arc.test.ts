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
