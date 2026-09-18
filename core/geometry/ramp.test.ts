import { describe, expect, it } from "vitest"
import { generateRamp, generateStair, RAMP_LANDING, RAMP_SLOPE } from "./stair-generator"

describe("пандус для МГН", () => {
  it("длина марша — перепад × уклон 1:20", () => {
    const rise = 900
    const g = generateRamp(rise, 1200, false)
    const depth = g.hole.maxZ - g.hole.minZ
    expect(depth).toBe(RAMP_LANDING * 2 + rise * RAMP_SLOPE)
  })

  it("площадки сверху и снизу по 1,5 м", () => {
    const g = generateRamp(600, 1200, false)
    const landings = g.steps.filter((s) => Math.abs(s.d - RAMP_LANDING) < 1)
    expect(landings.length).toBeGreaterThanOrEqual(2)
  })

  it("марш наклонён, уклон не круче 1:12", () => {
    const g = generateRamp(750, 1200, false)
    const slab = g.steps.find((s) => s.tilt)
    expect(slab).toBeTruthy()
    expect(Math.tan(slab!.tilt!)).toBeLessThanOrEqual(1 / 12)
  })

  it("есть невидимая поверхность обхода — в режиме Walk по пандусу можно подняться", () => {
    const g = generateRamp(600, 1200, false)
    expect(g.ramps?.length).toBe(1)
    expect(g.ramps![0].tilt).toBeGreaterThan(0)
  })

  it("поручни ставятся на двух высотах с обеих сторон", () => {
    const g = generateRamp(900, 1200, true)
    const heights = new Set(g.rails.filter((r) => r.d > 500).map((r) => Math.round(r.y + (900 / 2))))
    expect(heights.size).toBe(2)
    const sides = new Set(g.rails.map((r) => Math.sign(r.x)))
    expect(sides.has(1) && sides.has(-1)).toBe(true)
  })

  it("без перил поручней нет", () => {
    expect(generateRamp(600, 1200, false).rails).toHaveLength(0)
  })

  it("бортики по краям марша не дают коляске съехать", () => {
    const g = generateRamp(600, 1200, false)
    const kerbs = g.steps.filter((s) => s.w === 50 && s.tilt)
    expect(kerbs).toHaveLength(2)
  })

  it("форма ramp доступна через общий генератор", () => {
    const g = generateStair("ramp", 600, 1200, true)
    expect(g.steps.length).toBeGreaterThan(2)
    expect(g.hole.maxZ).toBeGreaterThan(RAMP_LANDING)
  })
})
