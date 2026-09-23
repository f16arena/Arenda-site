import { describe, expect, it } from "vitest"
import type { FloorElement, FloorLayoutV2, RectRoom } from "@/lib/floor-layout"
import { classifyCategory } from "./category"
import { shortTenantName } from "./display-name"
import { buildingFootprint, generateSchemaLayout } from "./generate"
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
    debt: 0,
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

  it("помещения с долгом считаются отдельно от статуса аренды", () => {
    const layout = layoutOf([
      { id: "r1", spaceId: "s1", x: 0, w: 10 },
      { id: "r2", spaceId: "s2", x: 10, w: 10 },
    ])
    const view = buildFloorView(
      layout,
      [
        space({ id: "s1", tenantName: "Должник", debt: 480000, contractEnd: inDays(400) }),
        space({ id: "s2", tenantName: "Платит вовремя", contractEnd: inDays(400) }),
      ],
      now,
    )
    expect(view.debtCount).toBe(1)
    // долг не меняет статус: помещение по-прежнему занято
    expect(view.rooms[0].status).toBe("OCCUPIED")
    expect(view.rooms[0].debt).toBe(480000)
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

  it("длинное имя переносится на две строки, а не падает сразу до номера", () => {
    const layout = layoutOf([{ id: "r1", spaceId: "s1", x: 0, w: 9 }])
    const view = buildFloorView(layout, [
      space({ id: "s1", number: "208", tenantName: "Усть-Каменогорская школа Айкидо" }),
    ])
    const labels = layoutLabels(view.rooms, { detail: "near", pxPerMeter: 20, project })
    expect(labels[0].mode).toBe("full")
    expect(labels[0].lines).toHaveLength(2)
    expect(labels[0].lines.join(" ")).toBe("Усть-Каменогорская школа Айкидо")
  })

  it("если не помогает и перенос — обрезаем многоточием, номер это крайний случай", () => {
    const layout = layoutOf([{ id: "r1", spaceId: "s1", x: 0, w: 4 }])
    const view = buildFloorView(layout, [
      space({ id: "s1", number: "204", tenantName: "Невероятнодлинноеназваниебезпробелов" }),
    ])
    const labels = layoutLabels(view.rooms, { detail: "near", pxPerMeter: 20, project })
    expect(labels[0].mode).toBe("full")
    expect(labels[0].lines[0].endsWith("…")).toBe(true)
  })

  it("в совсем узкое помещение уходит только номер", () => {
    const layout = layoutOf([{ id: "r1", spaceId: "s1", x: 0, w: 2.2 }])
    const view = buildFloorView(layout, [
      space({ id: "s1", number: "204", tenantName: "Очень длинное название арендатора" }),
    ])
    const labels = layoutLabels(view.rooms, { detail: "near", pxPerMeter: 20, project })
    expect(labels[0].mode).toBe("short")
    expect(labels[0].lines[0]).toBe("204")
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
    const byRoom = new Map(labels.map((label) => [label.roomId, label]))
    // большая площадь забирает имя, проигравшая опускается до номера
    expect(byRoom.get("big")?.mode).toBe("full")
    expect(byRoom.get("small")?.mode).toBe("short")
  })

  it("на дальнем зуме подписей нет вовсе", () => {
    const layout = layoutOf([{ id: "r1", spaceId: "s1", x: 0, w: 10 }])
    const view = buildFloorView(layout, [space({ id: "s1", tenantName: "Технопарк" })])
    expect(layoutLabels(view.rooms, { detail: "far", pxPerMeter: 6, project })).toHaveLength(0)
  })
})

describe("имя на плане", () => {
  it("форма собственности и кавычки в подпись не идут", () => {
    expect(shortTenantName('ТОО "Ювелир Trend"')).toBe("Ювелир Trend")
    expect(shortTenantName("ИП Gold Караоке-бар")).toBe("Gold Караоке-бар")
    expect(shortTenantName("ТОО «VEYRON»")).toBe("VEYRON")
    expect(shortTenantName("Усть-Каменогорская школа Айкидо")).toBe(
      "Усть-Каменогорская школа Айкидо",
    )
  })

  it("если кроме формы собственности ничего нет, оставляем как есть", () => {
    expect(shortTenantName("ТОО")).toBe("ТОО")
    expect(shortTenantName(null)).toBe("")
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

  // Вид деятельности заводит администратор, и по-казахски он напишет
  // «дәріхана», а не «аптека». Без этого у него на плане не будет иконок вовсе.
  it("казахский текст вида деятельности тоже узнаётся", () => {
    expect(classifyCategory("дәріхана")).toBe("health")
    expect(classifyCategory("мейрамхана")).toBe("food")
    expect(classifyCategory("сұлулық салоны")).toBe("beauty")
    expect(classifyCategory("киім дүкені")).toBe("retail")
    expect(classifyCategory("кеңсе")).toBe("office")
    expect(classifyCategory("балабақша")).toBe("kids")
  })
})

describe("схема из помещений", () => {
  const roomsOf = (layout: FloorLayoutV2) =>
    layout.elements.filter((el): el is RectRoom => el.type === "rect" && Boolean(el.spaceId))

  it("площадь каждого помещения сохраняется точно", () => {
    const layout = generateSchemaLayout([
      { id: "a", number: "101", area: 40, kind: "RENTABLE" },
      { id: "b", number: "102", area: 60, kind: "RENTABLE" },
      { id: "c", number: "103", area: 50, kind: "RENTABLE" },
      { id: "d", number: "104", area: 30, kind: "RENTABLE" },
    ])
    expect(layout).not.toBeNull()
    const rooms = roomsOf(layout!)
    expect(rooms).toHaveLength(4)
    const bySpace = new Map(rooms.map((el) => [el.spaceId, el]))
    for (const [spaceId, area] of [["a", 40], ["b", 60], ["c", 50], ["d", 30]] as const) {
      const room = bySpace.get(spaceId)!
      expect(room.width * room.height).toBeCloseTo(area, 0)
    }
    expect(layout!.source).toBe("schema")
  })

  it("одно большое и два крошечных помещения не дают стометровую кишку", () => {
    // ровно тот случай, на котором ломалась раскладка рядами
    const layout = generateSchemaLayout([
      { id: "big", number: "1", area: 600, kind: "RENTABLE" },
      { id: "s1", number: "2", area: 20, kind: "RENTABLE" },
      { id: "s2", number: "3", area: 26, kind: "RENTABLE" },
    ])!
    for (const room of roomsOf(layout)) {
      const longest = Math.max(room.width, room.height)
      const shortest = Math.min(room.width, room.height)
      expect(longest).toBeLessThanOrEqual(layout.width + 0.01)
      expect(longest / shortest).toBeLessThan(6)
    }
  })

  it("общий контур делает этажи одного размера", () => {
    const footprint = buildingFootprint([646, 200, 645])!
    const small = generateSchemaLayout([{ id: "x", number: "1", area: 200, kind: "RENTABLE" }], { footprint })!
    const large = generateSchemaLayout([{ id: "y", number: "1", area: 645, kind: "RENTABLE" }], { footprint })!
    expect(small.width).toBe(large.width)
    expect(small.height).toBe(large.height)
    // на маленьком этаже остаток контура стал общей зоной
    expect(small.elements.some((el) => el.type === "rect" && !el.spaceId && el.kind === "common")).toBe(true)
  })

  it("общие зоны остаются общими, а пустой список даёт null", () => {
    const layout = generateSchemaLayout([
      { id: "wc", number: "001", area: 12, kind: "COMMON" },
      { id: "a", number: "101", area: 40, kind: "RENTABLE" },
    ])!
    const wc = layout.elements.find(
      (el): el is RectRoom => el.type === "rect" && el.spaceId === "wc",
    )
    expect(wc?.kind).toBe("common")
    expect(generateSchemaLayout([])).toBeNull()
    expect(generateSchemaLayout([{ id: "x", number: "1", area: 0, kind: "RENTABLE" }])).toBeNull()
  })
})
