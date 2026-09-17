import { describe, expect, it } from "vitest"
import { nodeDragTarget, passedDragThreshold, wallPushDelta } from "./drag-math"

describe("перетаскивание: клик — не сдвиг", () => {
  it("дрожание мыши в пару пикселей не считается перетаскиванием", () => {
    expect(passedDragThreshold(100, 100, 102, 101)).toBe(false)
    expect(passedDragThreshold(100, 100, 106, 100)).toBe(true)
  })
})

describe("сдвиг стены", () => {
  const a = { x: 0, y: 0 }
  const b = { x: 10_000, y: 0 }

  it("движение вдоль стены её не двигает", () => {
    const d = wallPushDelta(a, b, { x: 2_000, y: 0 }, { x: 7_000, y: 0 }, 50)
    expect(d.offset).toBe(0)
    expect(Math.abs(d.dx)).toBe(0)
    expect(Math.abs(d.dy)).toBe(0)
  })

  it("диагональное движение даёт только перпендикулярную часть", () => {
    const d = wallPushDelta(a, b, { x: 0, y: 0 }, { x: 3_000, y: 420 }, 50)
    expect(Math.abs(d.dx)).toBeLessThan(1e-9)
    expect(d.dy).toBe(400)
  })

  it("наклонная стена двигается по своей нормали", () => {
    const d = wallPushDelta({ x: 0, y: 0 }, { x: 3_000, y: 3_000 }, { x: 0, y: 0 }, { x: -1_000, y: 1_000 }, 10)
    // нормаль (-√½, √½): смещение ≈ 1414 → 1410
    expect(d.offset).toBe(1410)
    expect(d.dx).toBeCloseTo(-1410 / Math.SQRT2, 6)
    expect(d.dy).toBeCloseTo(1410 / Math.SQRT2, 6)
  })

  it("нулевая стена не ломается", () => {
    expect(wallPushDelta(a, a, a, b, 50)).toEqual({ dx: 0, dy: 0, offset: 0 })
  })
})

describe("сдвиг узла", () => {
  it("шаг сетки от исходной точки, а не от нуля координат", () => {
    const t = nodeDragTarget({ x: 36_550, y: 12_430 }, { x: 0, y: 0 }, { x: 104, y: -96 }, [], 100, 0)
    expect(t).toEqual({ x: 36_650, y: 12_330 })
  })

  it("узел встаёт на ось соседа — прямой угол сохраняется", () => {
    const neighbors = [{ x: 0, y: 5_000 }, { x: 8_000, y: 0 }]
    const t = nodeDragTarget({ x: 7_900, y: 5_100 }, { x: 0, y: 0 }, { x: 80, y: -70 }, neighbors, 10, 150)
    expect(t).toEqual({ x: 8_000, y: 5_000 })
  })

  it("далеко от осей соседей — свободно", () => {
    const t = nodeDragTarget({ x: 1_000, y: 1_000 }, { x: 0, y: 0 }, { x: 2_000, y: 2_000 }, [{ x: 0, y: 0 }], 10, 150)
    expect(t).toEqual({ x: 3_000, y: 3_000 })
  })
})
