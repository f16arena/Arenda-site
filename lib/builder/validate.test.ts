import { describe, expect, it } from "vitest"
import { issuesSummary, validateDocument, validateFloor } from "./validate"
import type { BuilderDocument, Floor } from "@/types/builder"

/** Прямоугольная комната 8×6 м из четырёх стен. */
function boxFloor(extra: Partial<Floor> = {}): Floor {
  const nodes = {
    n1: { id: "n1", x: 0, y: 0 },
    n2: { id: "n2", x: 8000, y: 0 },
    n3: { id: "n3", x: 8000, y: 6000 },
    n4: { id: "n4", x: 0, y: 6000 },
  }
  const wall = (id: string, a: string, b: string) => ({ id, a, b, thickness: 200, height: 3000, kind: "exterior" as const })
  return {
    id: "f1",
    name: "1 этаж",
    level: 1,
    elevation: 0,
    height: 3000,
    visible: true,
    locked: false,
    opacity: 1,
    wallGraph: { nodes, edges: { w1: wall("w1", "n1", "n2"), w2: wall("w2", "n2", "n3"), w3: wall("w3", "n3", "n4"), w4: wall("w4", "n4", "n1") } },
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

const door = (over: Record<string, unknown> = {}) => ({ id: "d1", wallId: "w1", type: "door", variant: "single", width: 900, height: 2100, sillHeight: 0, offset: 4000, ...over })
const window_ = (over: Record<string, unknown> = {}) => ({ id: "o1", wallId: "w2", type: "window", variant: "single", width: 1500, height: 1500, sillHeight: 850, offset: 3000, ...over })

const solo = { lowest: true, multiFloor: false }

describe("validateFloor", () => {
  it("помещение без двери — ошибка", () => {
    const issues = validateFloor(boxFloor(), solo)
    expect(issues.some((i) => i.level === "error" && i.text.includes("нет входа"))).toBe(true)
  })

  it("с дверью ошибки о входе нет", () => {
    const issues = validateFloor(boxFloor({ openings: [door()] } as unknown as Partial<Floor>), solo)
    expect(issues.some((i) => i.text.includes("нет входа"))).toBe(false)
  })

  it("арендное помещение без окон — предупреждение", () => {
    const issues = validateFloor(boxFloor({ openings: [door()] } as unknown as Partial<Floor>), solo)
    expect(issues.some((i) => i.level === "warn" && i.text.includes("без окон"))).toBe(true)
  })

  it("окно, вылезающее за стену, — ошибка", () => {
    const issues = validateFloor(boxFloor({ openings: [door(), window_({ id: "o2", wallId: "w2", offset: 5900, width: 1500 })] } as unknown as Partial<Floor>), solo)
    expect(issues.some((i) => i.level === "error" && i.text.includes("выходит за её край"))).toBe(true)
  })

  it("узкая эвакуационная дверь — предупреждение", () => {
    const issues = validateFloor(boxFloor({ openings: [door({ width: 700, exit: "emergency" })] } as unknown as Partial<Floor>), solo)
    expect(issues.some((i) => i.text.includes("Эвакуационная дверь уже"))).toBe(true)
  })

  it("окно во внутренней стене — предупреждение", () => {
    const f = boxFloor({ openings: [door(), window_()] } as unknown as Partial<Floor>)
    f.wallGraph.edges.w2.kind = "interior" as never
    expect(validateFloor(f, solo).some((i) => i.text.includes("во внутренней стене"))).toBe(true)
  })

  it("крупное арендное помещение без привязки к базе — предупреждение", () => {
    const f = boxFloor({ openings: [door(), window_()] } as unknown as Partial<Floor>)
    expect(validateFloor(f, solo).some((i) => i.text.includes("не связано с помещением из базы"))).toBe(true)
    const linked = boxFloor({ openings: [door(), window_()], premiseLinks: { } } as unknown as Partial<Floor>)
    const rooms = validateFloor(linked, solo).filter((i) => i.id.startsWith("room-nolink-"))
    expect(rooms.length).toBe(1)
  })

  it("этаж без лестницы в многоэтажном здании — ошибка", () => {
    const issues = validateFloor(boxFloor({ openings: [door(), window_()] } as unknown as Partial<Floor>), { lowest: true, multiFloor: true })
    expect(issues.some((i) => i.level === "error" && i.text.includes("нет лестницы"))).toBe(true)
  })

  it("верхний этаж не требует своей лестницы, если марш приходит снизу", () => {
    const top = boxFloor({ id: "f2", name: "2 этаж", openings: [door(), window_()] } as unknown as Partial<Floor>)
    const issues = validateFloor(top, { lowest: false, multiFloor: true, reachedFromBelow: true })
    expect(issues.some((i) => i.text.includes("нет лестницы"))).toBe(false)
  })

  it("вход выше земли без пандуса — предупреждение про МГН", () => {
    const f = boxFloor({ elevation: 600, openings: [door({ exit: "main" }), window_()] } as unknown as Partial<Floor>)
    const issues = validateFloor(f, solo)
    expect(issues.some((i) => i.text.includes("МГН"))).toBe(true)
  })

  it("с пандусом замечания про МГН нет", () => {
    const f = boxFloor({
      elevation: 600,
      openings: [door({ exit: "main" }), window_()],
      stairs: [{ id: "r1", shape: "ramp", fromFloorId: "f1", toFloorId: "f1", position: { x: 4000, y: -1200 }, rotationDeg: 0, width: 1200, railing: true, rise: 600 }],
    } as unknown as Partial<Floor>)
    expect(validateFloor(f, solo).some((i) => i.text.includes("МГН"))).toBe(false)
  })

  it("лестница вне здания — ошибка", () => {
    const f = boxFloor({
      openings: [door(), window_()],
      stairs: [{ id: "s1", shape: "straight", fromFloorId: "f1", toFloorId: "f1", position: { x: 20000, y: 3000 }, rotationDeg: 0, width: 1100, railing: true }],
    } as unknown as Partial<Floor>)
    expect(validateFloor(f, solo).some((i) => i.level === "error" && i.text.includes("вне здания"))).toBe(true)
  })

  it("ни одна дверь не отмечена выходом — предупреждение", () => {
    const f = boxFloor({ openings: [door()] } as unknown as Partial<Floor>)
    expect(validateFloor(f, solo).some((i) => i.text.includes("план эвакуации"))).toBe(true)
    const marked = boxFloor({ openings: [door({ exit: "main" })] } as unknown as Partial<Floor>)
    expect(validateFloor(marked, solo).some((i) => i.text.includes("план эвакуации"))).toBe(false)
  })

  it("низкий потолок — предупреждение", () => {
    expect(validateFloor(boxFloor({ height: 2300 }), solo).some((i) => i.text.includes("Высота этажа"))).toBe(true)
  })

  it("стена нулевой длины — ошибка", () => {
    const f = boxFloor()
    f.wallGraph.nodes.n5 = { id: "n5", x: 10, y: 0 } as never
    f.wallGraph.edges.w5 = { id: "w5", a: "n1", b: "n5", thickness: 100, height: 3000, kind: "interior" } as never
    expect(validateFloor(f, solo).some((i) => i.text.includes("случайный клик"))).toBe(true)
  })

  it("у замечания есть ссылка на элемент и точка на плане", () => {
    const issues = validateFloor(boxFloor({ openings: [door()] } as unknown as Partial<Floor>), solo)
    const room = issues.find((i) => i.target?.type === "room")
    expect(room?.floorId).toBe("f1")
    expect(room?.at).toBeTruthy()
  })
})

describe("validateDocument", () => {
  const doc = (floors: Floor[]): BuilderDocument =>
    ({ version: 1, site: { objects: [], water: [], paths: [], pavements: [] }, buildings: [{ id: "b1", name: "Здание", origin: { x: 0, y: 0 }, floors, sections: [] }] }) as unknown as BuilderDocument

  it("пустые этажи не проверяются", () => {
    const empty = boxFloor({ wallGraph: { nodes: {}, edges: {} } } as unknown as Partial<Floor>)
    expect(validateDocument(doc([empty]))).toEqual([])
  })

  it("лестница с первого этажа связывает второй", () => {
    const stair = { id: "s1", shape: "straight", fromFloorId: "f1", toFloorId: "f2", position: { x: 4000, y: 3000 }, rotationDeg: 0, width: 1100, railing: true }
    const f1 = boxFloor({ openings: [door(), window_()], stairs: [stair] } as unknown as Partial<Floor>)
    const f2 = boxFloor({ id: "f2", name: "2 этаж", elevation: 3000, openings: [door(), window_()] } as unknown as Partial<Floor>)
    const issues = validateDocument(doc([f1, f2]))
    expect(issues.filter((i) => i.text.includes("нет лестницы"))).toHaveLength(0)
  })

  it("ошибки идут раньше предупреждений", () => {
    const issues = validateDocument(doc([boxFloor()]))
    const firstWarn = issues.findIndex((i) => i.level === "warn")
    const lastError = issues.map((i) => i.level).lastIndexOf("error")
    if (firstWarn >= 0 && lastError >= 0) expect(lastError).toBeLessThan(firstWarn)
  })
})

describe("issuesSummary", () => {
  it("без замечаний", () => {
    expect(issuesSummary([])).toBe("Замечаний нет")
  })

  it("склонения", () => {
    const mk = (n: number, level: "error" | "warn") => Array.from({ length: n }, (_, i) => ({ id: String(i), level, text: "" }))
    expect(issuesSummary(mk(1, "error"))).toBe("1 ошибка")
    expect(issuesSummary(mk(3, "warn"))).toBe("3 замечания")
    expect(issuesSummary([...mk(2, "error"), ...mk(5, "warn")])).toBe("2 ошибки, 5 замечаний")
  })
})
