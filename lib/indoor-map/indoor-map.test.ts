import { describe, expect, it } from "vitest"
import type { FloorLayoutV2 } from "@/lib/floor-layout"
import { classifyCategory } from "./category"
import { centroid, labelAnchor, pointInPolygon, widthAt } from "./geometry"
import { layoutLabels } from "./labels"
import { buildFloorView, type SpaceLite } from "./model"

// П-образное помещение: центр тяжести такой фигуры падает в вырез, то есть
// вне самого помещения — классический случай, на котором подпись уезжает в коридор.
const U_SHAPE = [
  { x: 0, y: 0 },
  { x: 12, y: 0 },
  { x: 12, y: 10 },
  { x: 9, y: 10 },
  { x: 9, y: 3 },
  { x: 3, y: 3 },
  { x: 3, y: 10 },
  { x: 0, y: 10 },
]

describe("геометрия", () => {
  it("центр тяжести П-образного помещения лежит вне его, якорь подписи — внутри", () => {
    expect(pointInPolygon(centroid(U_SHAPE), U_SHAPE)).toBe(false)
    expect(pointInPolygon(labelAnchor(U_SHAPE), U_SHAPE)).toBe(true)
  })

  it("ширина на высоте якоря считается по пересечению с рёбрами", () => {
    // внизу фигура целая — 12 м; выше выреза осталась ножка шириной 3 м
    expect(widthAt(U_SHAPE, { x: 6, y: 1.5 })).toBeCloseTo(12, 5)
    expect(widthAt(U_SHAPE, { x: 1.5, y: 6 })).toBeCloseTo(3, 5)
  })
})

function layoutOf(rooms: Array<{ id: string; spaceId: string; x: number; w: number }>): FloorLayoutV2 {
  return {
    version: 2,
    width: 100,
    height: 10,
    elements: rooms.map((room) => ({
      type: "rect" as const,
      id: room.id,
      spaceId: room.spaceId,
      kind: "rentable" as const,
      x: room.x,
      y: 0,
      width: room.w,
      height: 10,
    })),
  }
}

function space(partial: Partial<SpaceLite> & { id: string }): SpaceLite {
  return {
    number: "1",
    area: 100,
    status: "OCCUPIED",
    kind: "RENTABLE",
    tenantId: null,
    tenantName: null,
    contractEnd: null,
    category: null,
    ...partial,
  }
}

describe("статусы", () => {
  const now = new Date("2026-09-15T00:00:00Z")
  const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString()

  it("договор, который заканчивается в пределах 90 дней, красит помещение в «освобождается»", () => {
    const layout = layoutOf([{ id: "r1", spaceId: "s1", x: 0, w: 10 }])
    const view = buildFloorView(
      layout,
      [space({ id: "s1", tenantName: "Алма Мода", tenantId: "t1", contractEnd: inDays(60) })],
      now,
    )
    expect(view.rooms[0].status).toBe("EXPIRING")
    expect(view.rooms[0].daysLeft).toBe(60)
  })

  it("длинный договор оставляет помещение занятым", () => {
    const layout = layoutOf([{ id: "r1", spaceId: "s1", x: 0, w: 10 }])
    const view = buildFloorView(
      layout,
      [space({ id: "s1", tenantName: "Алма Мода", contractEnd: inDays(400) })],
      now,
    )
    expect(view.rooms[0].status).toBe("OCCUPIED")
  })

  it("помещение в ремонте не подписывается как свободное", () => {
    const layout = layoutOf([{ id: "r1", spaceId: "s1", x: 0, w: 10 }])
    const view = buildFloorView(layout, [space({ id: "s1", status: "MAINTENANCE" })], now)
    expect(view.rooms[0].status).toBe("MAINTENANCE")
    expect(view.rooms[0].title).toBe("Не сдаётся")
  })

  it("свободная площадь считается только по арендопригодным", () => {
    const layout = layoutOf([
      { id: "r1", spaceId: "s1", x: 0, w: 10 },
      { id: "r2", spaceId: "s2", x: 10, w: 10 },
    ])
    const view = buildFloorView(
      layout,
      [
        space({ id: "s1", status: "VACANT", area: 100 }),
        space({ id: "s2", kind: "COMMON", area: 100 }),
      ],
      now,
    )
    expect(view.vacantArea).toBe(100)
    expect(view.rentableArea).toBe(100)
    expect(view.vacantCount).toBe(1)
  })
})

describe("подписи", () => {
  const project = (p: { x: number; y: number }) => ({ x: p.x * 20, y: p.y * 20 })

  it("подпись, которая не влезает в помещение, опускается до номера", () => {
    const layout = layoutOf([{ id: "r1", spaceId: "s1", x: 0, w: 4 }])
    const view = buildFloorView(layout, [
      space({ id: "s1", number: "204", tenantName: "Очень длинное название арендатора" }),
    ])
    const labels = layoutLabels(view.rooms, { detail: "near", pxPerMeter: 20, project })
    expect(labels).toHaveLength(1)
    expect(labels[0].mode).toBe("short")
    expect(labels[0].text).toBe("204")
  })

  it("при конфликте подписей побеждает помещение с большей площадью", () => {
    // две узкие полосы одна над другой: по вертикали подписи неизбежно налезают
    const layout: FloorLayoutV2 = {
      version: 2,
      width: 12,
      height: 4,
      elements: [
        { type: "rect", id: "big", spaceId: "s-big", x: 0, y: 0, width: 10, height: 1.5 },
        { type: "rect", id: "small", spaceId: "s-small", x: 0, y: 1.5, width: 8, height: 1.5 },
      ],
    }
    const view = buildFloorView(layout, [
      space({ id: "s-big", number: "1", tenantName: "Технопарк", area: 15 }),
      space({ id: "s-small", number: "2", tenantName: "Кофейня", area: 12 }),
    ])
    const labels = layoutLabels(view.rooms, { detail: "near", pxPerMeter: 20, project })
    expect(labels.map((label) => label.roomId)).toContain("big")
    expect(labels.map((label) => label.roomId)).not.toContain("small")
  })

  it("на дальнем зуме подписей нет вовсе", () => {
    const layout = layoutOf([{ id: "r1", spaceId: "s1", x: 0, w: 10 }])
    const view = buildFloorView(layout, [space({ id: "s1", tenantName: "Технопарк" })])
    expect(layoutLabels(view.rooms, { detail: "far", pxPerMeter: 6, project })).toHaveLength(0)
  })
})

describe("категории", () => {
  it("свободный текст вида деятельности превращается в категорию", () => {
    expect(classifyCategory("кофейня")).toBe("food")
    expect(classifyCategory("розничная торговля одеждой")).toBe("retail")
    expect(classifyCategory("салон красоты")).toBe("beauty")
    expect(classifyCategory("аптека")).toBe("health")
    expect(classifyCategory(null, "офис компании")).toBe("office")
  })

  it("непонятный текст даёт «прочее», пустой — ничего", () => {
    expect(classifyCategory("ТОО Ромашка")).toBe("other")
    expect(classifyCategory(null, undefined, "  ")).toBeNull()
  })
})
