import { describe, expect, it } from "vitest"
import { suggestFloorNames, suggestRoomName } from "./room-naming"
import type { Floor } from "@/types/builder"
import type { FloorRoom } from "./rooms"

const rect = (x0: number, y0: number, w: number, h: number) => [
  { x: x0, y: y0 },
  { x: x0 + w, y: y0 },
  { x: x0 + w, y: y0 + h },
  { x: x0, y: y0 + h },
]

function room(id: string, x0: number, y0: number, w: number, h: number): FloorRoom {
  return { id, polygon: rect(x0, y0, w, h), areaMm2: w * h, nodeLoop: [], columnsMm2: 0 } as unknown as FloorRoom
}

function floor(extra: Partial<Floor> = {}): Floor {
  return {
    id: "f1", name: "1 этаж", level: 1, elevation: 0, height: 3300,
    visible: true, locked: false, opacity: 1,
    wallGraph: {
      nodes: { a: { id: "a", x: 0, y: 0 }, b: { id: "b", x: 30000, y: 0 } },
      edges: { w1: { id: "w1", a: "a", b: "b", thickness: 200, height: 3300, kind: "exterior" } },
    },
    openings: [], stairs: [], objects: [], annotations: [], mepRuns: [], mepDevices: [],
    roomNames: {}, roomUse: {}, premiseLinks: {},
    ...extra,
  } as unknown as Floor
}

/** Проём на нижней стене помещения (y = 0). */
const op = (id: string, type: "door" | "window", offset: number) => ({
  id, wallId: "w1", type, variant: "single", width: type === "door" ? 900 : 1500,
  height: type === "door" ? 2100 : 1500, sillHeight: type === "door" ? 0 : 850, offset,
})

// Подсказка возвращает ключ словаря (adminBuilder.roomNames), а не готовую
// строку: наименование переводится там, где его подставляют в модель.
describe("suggestRoomName", () => {
  it("помещение с окном — офис", () => {
    const f = floor({ openings: [op("o1", "window", 2000)] } as unknown as Partial<Floor>)
    expect(suggestRoomName(f, room("r1", 0, 0, 5000, 4000))).toBe("office")
  })

  it("большое помещение с окнами — офис открытой планировки", () => {
    const f = floor({ openings: [op("o1", "window", 4000)] } as unknown as Partial<Floor>)
    expect(suggestRoomName(f, room("r1", 0, 0, 12000, 8000))).toBe("openOffice")
  })

  it("длинное узкое с двумя дверями — коридор", () => {
    const f = floor({ openings: [op("d1", "door", 1000), op("d2", "door", 12000)] } as unknown as Partial<Floor>)
    expect(suggestRoomName(f, room("r1", 0, 0, 18000, 2000))).toBe("corridor")
  })

  it("маленькое глухое — санузел", () => {
    expect(suggestRoomName(floor(), room("r1", 0, 0, 1600, 1800))).toBe("wc")
  })

  it("глухое до 12 м² — кладовая", () => {
    expect(suggestRoomName(floor(), room("r1", 0, 0, 3000, 3000))).toBe("storage")
  })

  it("техническое назначение даёт электрощитовую", () => {
    const f = floor({ roomUse: { r1: "tech" } } as unknown as Partial<Floor>)
    expect(suggestRoomName(f, room("r1", 0, 0, 2000, 2000))).toBe("electrical")
  })

  it("МОП: большое — холл, поменьше — вестибюль", () => {
    const f = floor({ roomUse: { r1: "common", r2: "common" } } as unknown as Partial<Floor>)
    expect(suggestRoomName(f, room("r1", 0, 0, 8000, 6000))).toBe("hall")
    expect(suggestRoomName(f, room("r2", 0, 0, 4000, 4000))).toBe("lobby")
  })

  it("заданное вручную наименование не трогаем", () => {
    const f = floor({ roomNames: { r1: "Переговорная" } } as unknown as Partial<Floor>)
    expect(suggestRoomName(f, room("r1", 0, 0, 5000, 4000))).toBeNull()
  })

  it("крошечный остаток геометрии пропускаем", () => {
    expect(suggestRoomName(floor(), room("r1", 0, 0, 500, 600))).toBeNull()
  })
})

describe("suggestFloorNames", () => {
  it("возвращает наименования только для безымянных", () => {
    const f = floor({ roomNames: { r2: "Кабинет директора" }, openings: [op("o1", "window", 2000)] } as unknown as Partial<Floor>)
    const rooms = [room("r1", 0, 0, 5000, 4000), room("r2", 6000, 0, 5000, 4000)]
    const names = suggestFloorNames(f, rooms)
    expect(names.r1).toBe("office")
    expect(names.r2).toBeUndefined()
  })
})
