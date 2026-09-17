import { describe, expect, it } from "vitest"
import { generatePorch, PORCH_LANDING, stairPlanRects, stairToWorld } from "./stair-generator"

describe("крыльцо", () => {
  it("площадка вровень с полом, ступени спускаются до земли", () => {
    const g = generatePorch(450, 1800)
    expect(g.steps).toHaveLength(3) // площадка + 2 ступени, 3 подступенка по 150
    const top = (b: { y: number; h: number }) => b.y + b.h / 2
    const bottom = (b: { y: number; h: number }) => b.y - b.h / 2
    expect(top(g.steps[0])).toBeCloseTo(0)
    for (const b of g.steps) expect(bottom(b)).toBeCloseTo(-450)
    expect(top(g.steps[1])).toBeCloseTo(-150)
    expect(top(g.steps[2])).toBeCloseTo(-300)
    expect(g.hole.maxZ).toBe(PORCH_LANDING + 2 * 280)
  })

  it("поворот уводит ступени по нормали от стены", () => {
    // стена вдоль X, наружу — вниз по Y (нормаль 0,-1) → rotationDeg = 180
    const st = { shape: "porch" as const, position: { x: 1000, y: 0 }, rotationDeg: 180, width: 1800, railing: false, rise: 450 }
    const far = stairToWorld(st, 0, 1000)
    expect(far.x).toBeCloseTo(1000)
    expect(far.y).toBeCloseTo(-1000)
    const rects = stairPlanRects(st, 3000)
    expect(rects).toHaveLength(3)
    expect(Math.max(...rects.flat().map((p) => p.y))).toBeCloseTo(0)
  })
})
