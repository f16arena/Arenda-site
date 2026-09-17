import { describe, expect, it } from "vitest"
import type { Underlay } from "@/types/builder"
import { moveUnderlay, normalizeDeg, rotateUnderlay, scaleUnderlayAbout, underlayCenter } from "./underlay-math"

const base: Underlay = { url: "data:x", widthMm: 40_000, aspect: 2, x: -20_000, y: -10_000, rotationDeg: 0, opacity: 0.6 }

describe("подложка", () => {
  it("калибровка оставляет первую точку отрезка на месте", () => {
    const pivot = { x: 5_000, y: -3_000 }
    // точка скана на 3/4 ширины и 1/4 высоты — где она окажется после масштаба
    const u = scaleUnderlayAbout(base, pivot, 36_550 / 30_000)
    const k = 36_550 / 30_000
    expect(u.widthMm).toBeCloseTo(40_000 * k, 6)
    // относительная позиция опорной точки внутри картинки не меняется
    const relBefore = { x: (pivot.x - base.x) / base.widthMm, y: (pivot.y - base.y) / (base.widthMm / base.aspect) }
    const relAfter = { x: (pivot.x - u.x) / u.widthMm, y: (pivot.y - u.y) / (u.widthMm / u.aspect) }
    expect(relAfter.x).toBeCloseTo(relBefore.x, 9)
    expect(relAfter.y).toBeCloseTo(relBefore.y, 9)
  })

  it("масштаб при повороте тоже держит опорную точку", () => {
    const rotated = { ...base, rotationDeg: 90 }
    const pivot = { x: 1_000, y: 2_000 }
    const u = scaleUnderlayAbout(rotated, pivot, 2)
    const c0 = underlayCenter(rotated)
    const c1 = underlayCenter(u)
    expect(c1.x - pivot.x).toBeCloseTo(2 * (c0.x - pivot.x), 6)
    expect(c1.y - pivot.y).toBeCloseTo(2 * (c0.y - pivot.y), 6)
    expect(u.rotationDeg).toBe(90)
  })

  it("битый коэффициент ничего не ломает", () => {
    expect(scaleUnderlayAbout(base, { x: 0, y: 0 }, 0)).toBe(base)
    expect(scaleUnderlayAbout(base, { x: 0, y: 0 }, Number.NaN)).toBe(base)
  })

  it("сдвиг переносит точку скана в точку модели", () => {
    const u = moveUnderlay(base, { x: 100, y: 200 }, { x: 1_100, y: -800 })
    expect(u.x).toBe(base.x + 1_000)
    expect(u.y).toBe(base.y - 1_000)
    expect(u.widthMm).toBe(base.widthMm)
  })

  it("поворот копится и нормализуется", () => {
    expect(rotateUnderlay(base, -90).rotationDeg).toBe(270)
    expect(rotateUnderlay({ ...base, rotationDeg: 270 }, 90).rotationDeg).toBe(0)
    expect(normalizeDeg(725.5)).toBe(5.5)
    expect(underlayCenter(rotateUnderlay(base, 90))).toEqual(underlayCenter(base))
  })
})
