import { describe, expect, it } from "vitest"
import type { Floor } from "@/types/builder"
import { emptyGraph, insertWall } from "@/core/geometry/wall-graph"
import { floorToLayout } from "./to-layout"

/** Этаж с одной комнатой 6×4 м и дверью на нижней стене. */
function roomFloor(): Floor {
  let graph = emptyGraph()
  const corners = [
    { x: 0, y: 0 },
    { x: 6000, y: 0 },
    { x: 6000, y: 4000 },
    { x: 0, y: 4000 },
  ]
  for (let i = 0; i < 4; i++) {
    graph = insertWall(graph, corners[i], corners[(i + 1) % 4]).graph
  }
  const bottom = Object.values(graph.edges).find((e) => {
    const a = graph.nodes[e.a]
    const b = graph.nodes[e.b]
    return a.y === 0 && b.y === 0
  })!
  return {
    id: "f1",
    name: "1 этаж",
    level: 1,
    elevation: 0,
    height: 3500,
    visible: true,
    locked: false,
    opacity: 1,
    wallGraph: graph,
    openings: [{ id: "d1", wallId: bottom.id, type: "door", variant: "single", width: 900, height: 2100, sillHeight: 0, offset: 1000 }],
    stairs: [],
    objects: [],
    premiseLinks: {},
    roomMaterials: {},
  }
}

describe("модель → план этажа", () => {
  it("комната становится полигоном в метрах с площадью как в модели", () => {
    const floor = roomFloor()
    const rooms = Object.values(floor.wallGraph.edges).length
    expect(rooms).toBe(4)
    const layout = floorToLayout(floor)
    const polygon = layout.elements.find((el) => el.type === "polygon")
    expect(polygon).toBeDefined()
    if (polygon?.type === "polygon") {
      expect(polygon.points).toHaveLength(4)
      const xs = polygon.points.map((p) => p.x)
      const ys = polygon.points.map((p) => p.y)
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(6, 3)
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(4, 3)
    }
    expect(layout.source).toBe("model")
    expect(layout.ceilingHeight).toBe(3.5)
  })

  it("привязка комнаты к карточке переносится в spaceId", () => {
    const floor = roomFloor()
    const layout0 = floorToLayout(floor)
    const roomId = layout0.elements.find((el) => el.type === "polygon")!.id
    const linked = floorToLayout({ ...floor, premiseLinks: { [roomId]: "space-42" } })
    const polygon = linked.elements.find((el) => el.type === "polygon")
    expect(polygon?.type === "polygon" ? polygon.spaceId : null).toBe("space-42")
  })

  it("дверь встаёт по смещению вдоль стены, стены становятся линиями", () => {
    const layout = floorToLayout(roomFloor())
    const door = layout.elements.find((el) => el.type === "door")
    expect(door?.type === "door" ? door.x : null).toBeCloseTo(1.45, 2) // 1000 + 900/2
    expect(door?.type === "door" ? door.y : null).toBeCloseTo(0, 3)
    expect(layout.elements.filter((el) => el.type === "wall")).toHaveLength(4)
  })

  it("подложка переводится из миллиметров в метры", () => {
    const layout = floorToLayout({
      ...roomFloor(),
      underlay: { url: "data:x", widthMm: 36550, aspect: 1.5, x: -1000, y: -2000, rotationDeg: 0, opacity: 0.6 },
    })
    expect(layout.underlay?.widthMeters).toBeCloseTo(36.55, 3)
    expect(layout.underlay?.x).toBe(-1)
    // верх картинки в модели — на y + высота (ось вверх), на карте ось вниз
    expect(layout.underlay?.y).toBeCloseTo(-(-2 + 36.55 / 1.5), 2)
  })

  it("карта не переворачивает этаж: верх плана в модели — верх на карте", () => {
    const floor = roomFloor()
    const layout = floorToLayout(floor)
    const wall = layout.elements.find((el) => el.type === "wall" && el.y1 === el.y2 && el.y1 < -1)
    // стена на y = 4000 мм модели (верх комнаты) на карте оказывается выше (меньше y), чем стена на 0
    expect(wall).toBeDefined()
  })
})
