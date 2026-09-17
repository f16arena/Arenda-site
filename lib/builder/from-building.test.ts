import { describe, it, expect } from "vitest"

import { buildProjectFromBuilding, type SourceBuilding } from "./from-building"
import { parseDocument } from "@/types/builder"
import { detectRooms } from "@/core/geometry/room-detection"

const roomAreasM2 = (graph: Parameters<typeof detectRooms>[0]) =>
  detectRooms(graph)
    .map((r) => Math.round(r.areaMm2 / 1_000_000))
    .sort((a, b) => b - a)

/** План с двумя комнатами общей стеной, дверью, окном и лестницей. Холст 20×12 м. */
const drawnPlan = JSON.stringify({
  version: 2,
  width: 20,
  height: 12,
  ceilingHeight: 3.2,
  elements: [
    { type: "rect", id: "r1", spaceId: "sp-301", kind: "rentable", x: 2, y: 2, width: 10, height: 8, label: "301" },
    { type: "rect", id: "r2", spaceId: "sp-302", kind: "rentable", x: 12, y: 2, width: 6, height: 8, label: "302" },
    { type: "door", id: "dr1", x: 12, y: 6, width: 0.9, rotation: 90, swing: "left" },
    { type: "window", id: "wn1", x: 7, y: 2, width: 1.4, rotation: 0 },
    { type: "icon", id: "ic1", kind: "stairs", x: 4, y: 9, size: 1.5 },
  ],
})

describe("сборка проекта из данных здания", () => {
  it("по нарисованному плану даёт точные площади, привязки, проёмы и лестницу", () => {
    const src: SourceBuilding = {
      id: "b",
      name: "Дом с планом",
      floors: [1, 2].map((n) => ({
        id: `f${n}`,
        number: n,
        name: `${n} этаж`,
        kind: "FLOOR",
        totalArea: 128,
        layoutJson: drawnPlan,
        spaces: [
          { id: "sp-301", number: "301", area: 80, kind: "RENTABLE" },
          { id: "sp-302", number: "302", area: 48, kind: "RENTABLE" },
        ],
      })),
    }

    const { doc, report } = buildProjectFromBuilding(src)
    expect(() => parseDocument(doc)).not.toThrow()
    expect(report.floorsExact).toBe(2)
    expect(report.floorsApprox).toBe(0)
    // Площади взяты из контура, а не из карточки, поэтому расхождений быть не должно.
    expect(report.mismatches).toEqual([])

    const floors = doc.buildings[0].floors
    expect(floors).toHaveLength(2)
    for (const fl of floors) {
      expect(fl.height).toBe(3200) // высота потолка из плана
      expect(roomAreasM2(fl.wallGraph)).toEqual([80, 48])
      expect(Object.keys(fl.premiseLinks)).toHaveLength(2)
      expect(fl.openings).toHaveLength(2) // дверь + окно встали в стены
    }
    // Лестница связывает нижний этаж с верхним и только его.
    expect(floors[0].stairs).toHaveLength(1)
    expect(floors[0].stairs[0].toFloorId).toBe(floors[1].id)
    expect(floors[1].stairs).toHaveLength(0)
  })

  it("без плана раскладывает помещения по площадям, сохраняя площадь карточки", () => {
    const areas = [66.5, 41.7, 43.6, 78.2, 30.1, 49.5]
    const src: SourceBuilding = {
      id: "b",
      name: "Без планов",
      floors: [
        {
          id: "f1",
          number: 1,
          name: "1 этаж",
          kind: "FLOOR",
          // Помещения покрывают 310 м² из 400: остаток — коридоры и лестницы.
          totalArea: 400,
          // План существует, но пустой — в проде это обычный случай.
          layoutJson: '{"version":2,"width":20,"height":36,"elements":[]}',
          spaces: areas.map((a, i) => ({ id: `s${i}`, number: `20${i}`, area: a, kind: "RENTABLE" })),
        },
      ],
    }

    const { doc, report } = buildProjectFromBuilding(src)
    expect(() => parseDocument(doc)).not.toThrow()
    expect(report.floorsExact).toBe(0)
    expect(report.floorsApprox).toBe(1)
    expect(report.roomsLinked).toBe(areas.length)
    expect(report.mismatches).toEqual([])

    const fl = doc.buildings[0].floors[0]
    const rooms = roomAreasM2(fl.wallGraph)
    // Помещения плюс общая зона: они не покрывают весь этаж целиком.
    expect(rooms.length).toBe(areas.length + 1)
    // Общая зона — это именно остаток контура, а не выдуманная площадь.
    expect(rooms[0]).toBe(Math.round(400 - areas.reduce((a, b) => a + b, 0)))
    // Для каждой карточки есть комната той же площади с точностью до 5% —
    // ровно та граница, начиная с которой конвертер сам сообщает о расхождении.
    for (const a of areas) {
      const closest = rooms.reduce((best, r) => (Math.abs(r - a) < Math.abs(best - a) ? r : best), rooms[0])
      expect(Math.abs(closest - a) / a).toBeLessThan(0.05)
    }
  })

  it("накрывает верхний этаж крышей и набирает фасад окнами", () => {
    const floor = (n: number) => ({
      id: `f${n}`,
      number: n,
      name: `${n} этаж`,
      kind: "FLOOR",
      totalArea: 645,
      layoutJson: null,
      spaces: [{ id: `s${n}`, number: `${n}01`, area: 645, kind: "RENTABLE" }],
    })
    const src: SourceBuilding = { id: "b", name: "БЦ", floors: [floor(0), floor(1), floor(2)] }

    const { doc } = buildProjectFromBuilding(src)
    const floors = doc.buildings[0].floors

    // Крыша только на верхнем, иначе перекрытия растут посреди здания.
    expect(floors[floors.length - 1].roof?.type).toBe("flat")
    for (const fl of floors.slice(0, -1)) expect(fl.roof).toBeUndefined()

    // Окна идут по периметру ровным шагом, а не по одному в центр комнаты.
    for (const fl of floors) {
      const windows = fl.openings.filter((o) => o.type === "window")
      expect(windows.length).toBeGreaterThan(10)
      const walls = new Set(windows.map((w) => w.wallId))
      // Задействованы все наружные стены контура, а не одна.
      expect(walls.size).toBe(4)
      for (const w of windows) expect(w.sillHeight).toBeGreaterThan(0)
    }
  })

  it("не считает этажами крышу и территорию", () => {
    const src: SourceBuilding = {
      id: "b",
      name: "БЦ",
      floors: [
        {
          id: "f1",
          number: 1,
          name: "1 этаж",
          kind: "FLOOR",
          totalArea: 100,
          layoutJson: null,
          spaces: [{ id: "s1", number: "101", area: 100, kind: "RENTABLE" }],
        },
        {
          id: "f2",
          number: 2,
          name: "Крыша",
          kind: "ROOF",
          totalArea: null,
          layoutJson: null,
          spaces: [{ id: "s2", number: "Кар-Тел", area: 0, kind: "OBJECT" }],
        },
        { id: "f3", number: 3, name: "Территория", kind: "TERRITORY", totalArea: null, layoutJson: null, spaces: [] },
      ],
    }

    const { doc, report } = buildProjectFromBuilding(src)
    expect(doc.buildings[0].floors).toHaveLength(1)
    expect(report.floorsSkipped).toEqual(["Крыша", "Территория"])
    // Антенна на крыше — не комната, привязать её некуда.
    expect(report.spacesUnlinked).toContain("Кар-Тел")
  })

  it("не раскладывает вырожденно мелкие помещения, а честно сообщает о них", () => {
    const src: SourceBuilding = {
      id: "b",
      name: "БЦ",
      floors: [
        {
          id: "f1",
          number: 1,
          name: "1 этаж",
          kind: "FLOOR",
          totalArea: 615,
          layoutJson: null,
          spaces: [
            { id: "s1", number: "101", area: 613.5, kind: "RENTABLE" },
            { id: "s2", number: "А1", area: 1, kind: "RENTABLE" },
          ],
        },
      ],
    }

    const { report } = buildProjectFromBuilding(src)
    expect(report.spacesUnlinked).toContain("А1")
    expect(report.spacesUnlinked).not.toContain("101")
  })

  it("ставит все этажи на один контур здания", () => {
    // Из-за раскладки каждого этажа по отдельности этажи выходили разного
    // размера и не складывались в здание. Контур должен быть один.
    const floor = (n: number, spaces: { id: string; number: string; area: number; kind: string }[]) => ({
      id: `f${n}`,
      number: n,
      name: `${n} этаж`,
      kind: "FLOOR",
      totalArea: 645,
      layoutJson: null,
      spaces,
    })
    const src: SourceBuilding = {
      id: "b",
      name: "БЦ",
      floors: [
        floor(0, [{ id: "s0", number: "Весь", area: 645, kind: "RENTABLE" }]),
        floor(1, [
          { id: "s1", number: "101", area: 613.5, kind: "RENTABLE" },
          { id: "s2", number: "102", area: 31.5, kind: "RENTABLE" },
        ]),
        floor(2, [
          { id: "s3", number: "201", area: 66.5, kind: "RENTABLE" },
          { id: "s4", number: "202", area: 78.2, kind: "RENTABLE" },
        ]),
      ],
    }

    const { doc } = buildProjectFromBuilding(src)
    const boxes = doc.buildings[0].floors.map((fl) => {
      const xs = Object.values(fl.wallGraph.nodes).map((n) => n.x)
      const ys = Object.values(fl.wallGraph.nodes).map((n) => n.y)
      return {
        w: Math.round(Math.max(...xs) - Math.min(...xs)),
        h: Math.round(Math.max(...ys) - Math.min(...ys)),
      }
    })
    expect(boxes).toHaveLength(3)
    for (const b of boxes) {
      expect(b.w).toBe(boxes[0].w)
      expect(b.h).toBe(boxes[0].h)
    }
    // И этажи стоят друг на друге, а не в одной плоскости.
    const elevations = doc.buildings[0].floors.map((fl) => fl.elevation)
    expect(elevations).toEqual([...elevations].sort((a, b) => a - b))
    expect(new Set(elevations).size).toBe(3)
  })

  it("считает отметку пола от земли: вниз уходят только минусовые этажи", () => {
    const floor = (n: number, name: string) => ({
      id: `f${n}`,
      number: n,
      name,
      kind: "FLOOR",
      totalArea: 100,
      layoutJson: null,
      spaces: [{ id: `s${n}`, number: `${n}01`, area: 100, kind: "RENTABLE" }],
    })
    const src: SourceBuilding = {
      id: "b",
      name: "БЦ",
      floors: [floor(-1, "Подвал"), floor(0, "Цоколь"), floor(1, "1 этаж")],
    }

    const { doc } = buildProjectFromBuilding(src)
    const byName = Object.fromEntries(doc.buildings[0].floors.map((f) => [f.name, f.elevation]))
    const plinth = doc.buildings[0].floors.find((f) => f.name === "Цоколь")!
    // цоколь в земле, 1 этаж с уровня земли, стопка без зазоров
    expect(byName["Цоколь"]).toBe(-plinth.height)
    expect(byName["1 этаж"]).toBe(0)
    expect(byName["Подвал"]).toBeLessThan(byName["Цоколь"])
  })
})
