import { describe, expect, it } from "vitest"
import { doorBlockers, furnishFloor, furnishKind, furnishRoom } from "./furnish"
import type { FloorRoom } from "./rooms"
import type { Floor } from "@/types/builder"

const rect = (w: number, h: number) => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
]

function room(id: string, w: number, h: number, holes?: { x: number; y: number }[][]): FloorRoom {
  return {
    id,
    polygon: rect(w, h),
    holes,
    nodeLoop: [],
    areaMm2: w * h,
    columnsMm2: 0,
  } as unknown as FloorRoom
}

function floor(extra: Partial<Floor> = {}): Floor {
  return {
    id: "f1",
    name: "1 этаж",
    level: 1,
    elevation: 0,
    height: 3300,
    visible: true,
    locked: false,
    opacity: 1,
    wallGraph: { nodes: {}, edges: {} },
    openings: [],
    stairs: [],
    objects: [],
    annotations: [],
    mepRuns: [],
    mepDevices: [],
    roomNames: {},
    roomUse: {},
    premiseLinks: {},
    ...extra,
  } as unknown as Floor
}

describe("furnishKind", () => {
  const r = room("r1", 6000, 5000)

  it("по умолчанию помещение обставляется как офис", () => {
    expect(furnishKind(floor(), r)).toBe("office")
  })

  it("наименование определяет набор мебели", () => {
    expect(furnishKind(floor({ roomNames: { r1: "Магазин" } }), r)).toBe("retail")
    expect(furnishKind(floor({ roomNames: { r1: "Кафе" } }), r)).toBe("cafe")
    expect(furnishKind(floor({ roomNames: { r1: "Переговорная" } }), r)).toBe("meeting")
    expect(furnishKind(floor({ roomNames: { r1: "Холл" } }), r)).toBe("lobby")
  })

  it("санузлы и лестницы не обставляются", () => {
    expect(furnishKind(floor({ roomNames: { r1: "Санузел" } }), r)).toBe("none")
    expect(furnishKind(floor({ roomNames: { r1: "Лестничная клетка" } }), r)).toBe("none")
  })

  it("коридор не обставляется — только свет", () => {
    const corridor = room("c1", 20000, 2000)
    expect(furnishKind(floor(), corridor)).toBe("none")
    const items = furnishRoom(corridor, furnishKind(floor(), corridor), 3300)
    expect(items.every((i) => i.assetId === "ceiling_light")).toBe(true)
    expect(items.length).toBeGreaterThan(0)
  })

  it("безымянный санузел мебель не получает — берём подсказанное наименование", () => {
    // глухая комнатка 1,6×1,8 м: кнопка наименований назвала бы её санузлом
    const f = floor({ openings: [] } as unknown as Partial<Floor>)
    expect(furnishKind(f, room("wc", 1600, 1800))).toBe("none")
  })

  it("техническое помещение получает стеллаж", () => {
    expect(furnishKind(floor({ roomUse: { r1: "tech" } }), r)).toBe("tech")
  })
})

describe("furnishRoom", () => {
  it("в офисе появляются столы и светильники", () => {
    const items = furnishRoom(room("r1", 8000, 7000), "office", 3300)
    expect(items.some((i) => i.assetId === "office_desk")).toBe(true)
    expect(items.some((i) => i.assetId === "ceiling_light")).toBe(true)
  })

  it("светильники висят под потолком, мебель стоит на полу", () => {
    const items = furnishRoom(room("r1", 8000, 7000), "office", 3300)
    const light = items.find((i) => i.assetId === "ceiling_light")!
    const desk = items.find((i) => i.assetId === "office_desk")!
    // модель светильника висит на 2,85 м над точкой установки — итог под потолком
    expect(light.y + 2850).toBeGreaterThan(3300 - 400)
    expect(light.y + 2850).toBeLessThanOrEqual(3300)
    expect(desk.y).toBe(0)
  })

  it("вся мебель стоит внутри помещения", () => {
    const items = furnishRoom(room("r1", 9000, 6000), "office", 3300)
    for (const i of items) {
      expect(i.at.x).toBeGreaterThan(0)
      expect(i.at.y).toBeGreaterThan(0)
      expect(i.at.x).toBeLessThan(9000)
      expect(i.at.y).toBeLessThan(6000)
    }
  })

  it("крошечное помещение остаётся пустым", () => {
    expect(furnishRoom(room("r1", 1500, 1200), "office", 3300)).toEqual([])
  })

  it("мебель не лезет в островок внутри помещения", () => {
    const hole = [
      { x: 3000, y: 2000 },
      { x: 6000, y: 2000 },
      { x: 6000, y: 5000 },
      { x: 3000, y: 5000 },
    ]
    const items = furnishRoom(room("r1", 12000, 8000, [hole]), "office", 3300)
    const inHole = items.filter((i) => i.at.x > 3000 && i.at.x < 6000 && i.at.y > 2000 && i.at.y < 5000)
    expect(inHole).toEqual([])
  })

  it("расстановка повторяется при пересборке", () => {
    const a = furnishRoom(room("r1", 8000, 7000), "office", 3300)
    const b = furnishRoom(room("r1", 8000, 7000), "office", 3300)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it("занятое место (лестница) обходится", () => {
    const blocked = furnishRoom(room("r1", 8000, 7000), "office", 3300, [{ c: { x: 4000, y: 3500 }, w: 6000, d: 5000 }])
    const free = furnishRoom(room("r1", 8000, 7000), "office", 3300)
    const desks = (items: { assetId: string }[]) => items.filter((i) => i.assetId === "office_desk").length
    expect(desks(blocked)).toBeLessThan(desks(free))
  })
})

describe("doorBlockers", () => {
  it("перед дверью резервируется проход", () => {
    const f = floor({
      wallGraph: {
        nodes: { a: { id: "a", x: 0, y: 0 }, b: { id: "b", x: 6000, y: 0 } },
        edges: { w1: { id: "w1", a: "a", b: "b", thickness: 200, height: 3000, kind: "exterior" } },
      },
      openings: [{ id: "o1", wallId: "w1", type: "door", variant: "single", width: 900, height: 2100, sillHeight: 0, offset: 3000 }],
    } as unknown as Partial<Floor>)
    const b = doorBlockers(f)
    expect(b).toHaveLength(1)
    expect(b[0].c).toEqual({ x: 3000, y: 0 })
  })
})

describe("furnishFloor", () => {
  it("обставляет все подходящие помещения этажа", () => {
    const rooms = [room("r1", 8000, 7000), room("r2", 7000, 6000)]
    const items = furnishFloor(floor({ roomNames: { r2: "Кафе" } }), rooms)
    expect(items.some((i) => i.assetId === "office_desk")).toBe(true)
    expect(items.some((i) => i.assetId === "cafe_table")).toBe(true)
  })

  it("уже расставленная вручную мебель не перекрывается", () => {
    const rooms = [room("r1", 8000, 7000)]
    const f = floor({ objects: [{ id: "o1", assetId: "meeting_table", position: { x: 4000, y: 0, z: 3500 }, rotationY: 0, scale: 3, attachTo: "floor", locked: false }] } as unknown as Partial<Floor>)
    const items = furnishFloor(f, rooms)
    const near = items.filter((i) => i.y === 0 && Math.hypot(i.at.x - 4000, i.at.y - 3500) < 800)
    expect(near).toEqual([])
  })
})
