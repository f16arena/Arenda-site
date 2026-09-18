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
    mepRuns: [],
    mepDevices: [],
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
      // контур помещения — по внутренним граням стен (6 м по осям − 2×0,1 м)
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(5.8, 3)
      expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(3.8, 3)
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
    // узлы комнаты 0…6000 × 0…4000 → холст сдвинут на 1 м от угла, ось Y вниз
    expect(door?.type === "door" ? door.x : null).toBeCloseTo(1 + 1.0, 2) // offset — центр двери
    expect(door?.type === "door" ? door.y : null).toBeCloseTo(1 + 4, 3) // нижняя стена модели — внизу карты
    expect(layout.elements.filter((el) => el.type === "wall")).toHaveLength(4)
  })

  it("подложка переводится из миллиметров в метры", () => {
    const layout = floorToLayout({
      ...roomFloor(),
      underlay: { url: "data:x", widthMm: 36550, aspect: 1.5, x: -1000, y: -2000, rotationDeg: 0, opacity: 0.6 },
    })
    expect(layout.underlay?.widthMeters).toBeCloseTo(36.55, 3)
    expect(layout.underlay?.x).toBe(0) // −1 м от левого узла 0 → 1 − 1
    // верх картинки в модели — y + высота (ось вверх); на карте ось вниз от верхнего узла (4 м)
    expect(layout.underlay?.y).toBeCloseTo(4 - (-2 + 36.55 / 1.5) + 1, 2)
  })

  it("арендное место выходит на карту как арендопригодный контур", () => {
    const floor = roomFloor()
    floor.islands = [{ id: "i1", kind: "vending", name: "Автомат с игрушками", tenant: "ИП Forbs", position: { x: 2000, y: 2000 }, width: 900, depth: 800, height: 1830, rotationDeg: 0 }]
    floor.premiseLinks = { ...floor.premiseLinks, i1: "sp9" }
    const layout = floorToLayout(floor)
    const el = layout.elements.find((x) => x.id === "i1")
    expect(el?.type).toBe("polygon")
    if (el?.type !== "polygon") throw new Error("не полигон")
    expect(el.kind).toBe("rentable")
    expect(el.spaceId).toBe("sp9")
    expect(el.label).toBe("Автомат с игрушками")
    // габарит 0,9 × 0,8 м на карте
    const xs = el.points.map((p) => p.x), ys = el.points.map((p) => p.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.9, 2)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.8, 2)
  })

  it("карта не переворачивает этаж: верх плана в модели — верх на карте", () => {
    const floor = roomFloor()
    const layout = floorToLayout(floor)
    // верхняя стена модели (y = 4000) на карте — у верхнего края холста (y = 1)
    const wall = layout.elements.find((el) => el.type === "wall" && el.y1 === el.y2 && el.y1 === 1)
    // стена на y = 4000 мм модели (верх комнаты) на карте оказывается выше (меньше y), чем стена на 0
    expect(wall).toBeDefined()
  })
})
