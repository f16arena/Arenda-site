import { describe, expect, it } from "vitest"
import type { FloorLayoutV2, RectRoom } from "@/lib/floor-layout"
import {
  addRect,
  areaMismatch,
  linkSpace,
  moveRoom,
  moveVertex,
  removeElement,
  snapPoint,
  splitRoom,
} from "./edit"
import { findRoom } from "./edit"

function rect(id: string, x: number, y: number, width: number, height: number, spaceId?: string): RectRoom {
  return { type: "rect", id, x, y, width, height, kind: "rentable", spaceId: spaceId ?? null }
}

function layoutOf(...rooms: RectRoom[]): FloorLayoutV2 {
  return { version: 2, width: 60, height: 40, elements: [...rooms] }
}

describe("привязка", () => {
  it("прилипает к линии соседнего помещения, а не к сетке", () => {
    const layout = layoutOf(rect("a", 0, 0, 10, 8), rect("b", 20, 0, 6, 8))
    // 19.9 ближе к стене соседа (20), чем к своему шагу сетки
    const point = snapPoint({ x: 19.88, y: 0.04 }, { layout, exceptId: "a" })
    expect(point.x).toBe(20)
    expect(point.y).toBe(0)
  })

  it("вдали от чужих стен ложится на сетку 10 см", () => {
    const layout = layoutOf(rect("a", 0, 0, 10, 8))
    expect(snapPoint({ x: 3.43, y: 5.57 }, { layout, exceptId: "a" }).x).toBe(3.4)
  })
})

describe("правка помещений", () => {
  it("угол прямоугольника тянется, помещение остаётся прямоугольником", () => {
    const layout = moveVertex(layoutOf(rect("a", 0, 0, 10, 8)), "a", 2, { x: 12, y: 9 })
    const room = findRoom(layout, "a")
    expect(room?.type).toBe("rect")
    if (room?.type === "rect") {
      expect(room.width).toBe(12)
      expect(room.height).toBe(9)
    }
  })

  it("схлопнуть помещение в ноль нельзя", () => {
    const before = layoutOf(rect("a", 0, 0, 10, 8))
    const after = moveVertex(before, "a", 2, { x: 0.1, y: 0.1 })
    expect(after).toEqual(before)
  })

  it("помещение двигается целиком и прилипает к соседу", () => {
    // сосед стоит левой стеной на 20 — туда и должно прилипнуть
    const layout = layoutOf(rect("a", 0, 0, 10, 8), rect("b", 20, 0, 6, 8))
    const moved = moveRoom(layout, "a", { x: 19.9, y: 0 })
    const room = findRoom(moved, "a")
    expect(room?.type === "rect" ? room.x : null).toBe(20)
  })

  it("новое помещение добавляется, слишком мелкое — нет", () => {
    const added = addRect(layoutOf(), { x: 1, y: 1 }, { x: 5, y: 4 })
    expect(added?.layout.elements).toHaveLength(1)
    expect(addRect(layoutOf(), { x: 1, y: 1 }, { x: 1.2, y: 1.2 })).toBeNull()
  })

  it("деление пополам даёт два помещения, привязка остаётся только у первого", () => {
    const result = splitRoom(layoutOf(rect("a", 0, 0, 10, 8, "space-1")), "a", "vertical")
    expect(result).not.toBeNull()
    const first = findRoom(result!.layout, "a")
    const second = findRoom(result!.layout, result!.id)
    expect(first?.type === "rect" ? first.width : null).toBe(5)
    expect(second?.type === "rect" ? second.width : null).toBe(5)
    expect(first?.spaceId).toBe("space-1")
    expect(second?.spaceId).toBeNull()
  })

  it("привязка карточки переезжает: одна карточка — одно помещение", () => {
    const layout = layoutOf(rect("a", 0, 0, 10, 8, "space-1"), rect("b", 12, 0, 10, 8))
    const linked = linkSpace(layout, "b", "space-1")
    expect(findRoom(linked, "a")?.spaceId).toBeNull()
    expect(findRoom(linked, "b")?.spaceId).toBe("space-1")
  })

  it("удаление убирает помещение", () => {
    expect(removeElement(layoutOf(rect("a", 0, 0, 4, 4)), "a").elements).toHaveLength(0)
  })
})

describe("расхождение площадей", () => {
  it("рисунок не меняет договор, но расхождение видно", () => {
    const room = rect("a", 0, 0, 10, 8) // 80 м² на плане
    const mismatch = areaMismatch(room, 67)
    expect(mismatch).not.toBeNull()
    expect(mismatch?.contract).toBe(67)
    expect(mismatch?.drawn).toBe(80)
    expect(mismatch?.percent).toBe(19)
  })

  it("разница в пределах обмерной погрешности не тревожит", () => {
    expect(areaMismatch(rect("a", 0, 0, 10, 8), 81)).toBeNull()
    expect(areaMismatch(rect("a", 0, 0, 10, 8), null)).toBeNull()
  })
})
