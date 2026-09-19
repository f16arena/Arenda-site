import { describe, expect, it } from "vitest"
import { ISLAND_PRESETS, clampToRoom, islandArea, islandAt, islandLabel, islandPolygon, islandSchedule, islandsTotal, isWallMounted, mountHeight, passageLeft } from "./islands"
import type { Floor, Island } from "@/types/builder"

function island(extra: Partial<Island> = {}): Island {
  return {
    id: "i1",
    kind: "vending",
    name: "",
    tenant: "",
    position: { x: 5000, y: 2000 },
    width: 900,
    depth: 800,
    height: 1830,
    rotationDeg: 0,
    ...extra,
  }
}

function floor(islands: Island[]): Floor {
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
    islands,
    objects: [],
    premiseLinks: {},
    roomMaterials: {},
    mepRuns: [],
    mepDevices: [],
  } as unknown as Floor
}

describe("габарит места", () => {
  it("прямоугольник по центру: четыре угла вокруг точки", () => {
    const p = islandPolygon(island())
    expect(p).toHaveLength(4)
    expect(Math.min(...p.map((v) => v.x))).toBeCloseTo(4550)
    expect(Math.max(...p.map((v) => v.x))).toBeCloseTo(5450)
    expect(Math.min(...p.map((v) => v.y))).toBeCloseTo(1600)
    expect(Math.max(...p.map((v) => v.y))).toBeCloseTo(2400)
  })

  it("поворот на 90° меняет стороны местами, площадь та же", () => {
    const p = islandPolygon(island({ rotationDeg: 90 }))
    const w = Math.max(...p.map((v) => v.x)) - Math.min(...p.map((v) => v.x))
    const d = Math.max(...p.map((v) => v.y)) - Math.min(...p.map((v) => v.y))
    expect(w).toBeCloseTo(800)
    expect(d).toBeCloseTo(900)
    expect(islandArea(island({ rotationDeg: 90 }))).toBeCloseTo(0.72)
  })

  it("площадь в квадратных метрах", () => {
    expect(islandArea(island({ width: 2500, depth: 2000 }))).toBeCloseTo(5)
  })
})

describe("наименование", () => {
  it("своё имя важнее типового", () => {
    expect(islandLabel(island({ name: "Автомат с игрушками" }))).toBe("Автомат с игрушками")
  })

  it("без имени подставляется вид места", () => {
    expect(islandLabel(island())).toBe(ISLAND_PRESETS.vending.label)
    expect(islandLabel(island({ kind: "atm" }))).toBe("Банкомат")
  })
})

describe("выбор на плане", () => {
  it("точка внутри габарита попадает в место", () => {
    const f = floor([island()])
    expect(islandAt(f, { x: 5000, y: 2000 })?.id).toBe("i1")
    expect(islandAt(f, { x: 9000, y: 2000 })).toBeUndefined()
  })

  it("при наложении берётся верхнее (последнее добавленное)", () => {
    const f = floor([island(), island({ id: "i2" })])
    expect(islandAt(f, { x: 5000, y: 2000 })?.id).toBe("i2")
  })
})

describe("ведомость арендных мест", () => {
  const rooms = [{ id: "r1", polygon: [{ x: 0, y: 0 }, { x: 20000, y: 0 }, { x: 20000, y: 4000 }, { x: 0, y: 4000 }] }]

  it("номер места складывается из этажа и порядка", () => {
    const rows = islandSchedule([floor([island(), island({ id: "i2", position: { x: 9000, y: 2000 } })])])
    expect(rows.map((r) => r.mark)).toEqual(["М1.1", "М1.2"])
  })

  it("подписывается помещение, в котором стоит место", () => {
    const rows = islandSchedule([floor([island()])], () => rooms, () => "Коридор")
    expect(rows[0].place).toBe("Коридор")
  })

  it("этажи без мест в ведомость не попадают", () => {
    expect(islandSchedule([floor([])])).toHaveLength(0)
  })

  it("итог: количество, площадь и сколько сдано", () => {
    const rows = islandSchedule([
      floor([island({ tenant: "ИП Forbs" }), island({ id: "i2", kind: "kiosk", width: 2500, depth: 2000 })]),
    ])
    const t = islandsTotal(rows)
    expect(t.count).toBe(2)
    expect(t.area).toBeCloseTo(0.72 + 5)
    expect(t.leased).toBe(1)
  })

  it("размер записан «ширина×глубина»", () => {
    const rows = islandSchedule([floor([island()])])
    expect(rows[0].size).toBe("900×800")
  })
})

describe("проход в коридоре", () => {
  // коридор 20 × 3 м вдоль оси X
  const corridor = [{ x: 0, y: 0 }, { x: 20000, y: 0 }, { x: 20000, y: 3000 }, { x: 0, y: 3000 }]

  it("автомат у стены оставляет проход шире 1,2 м", () => {
    const left = passageLeft(island({ position: { x: 5000, y: 400 } }), corridor)
    expect(left).toBeGreaterThan(1200)
  })

  it("киоск посреди узкого коридора съедает проход", () => {
    const left = passageLeft(island({ kind: "kiosk", width: 2500, depth: 2000, position: { x: 5000, y: 1500 } }), corridor)
    expect(left).toBeLessThan(1200)
  })
})

describe("реклама на стене", () => {
  const corridor = [{ x: 0, y: 0 }, { x: 20000, y: 0 }, { x: 20000, y: 3000 }, { x: 0, y: 3000 }]

  it("баннер и лайтбокс считаются настенными, автомат — нет", () => {
    expect(isWallMounted(island({ kind: "banner" }))).toBe(true)
    expect(isWallMounted(island({ kind: "lightbox" }))).toBe(true)
    expect(isWallMounted(island())).toBe(false)
  })

  it("реклама висит на высоте 1,2 м, напольное место — на нуле", () => {
    expect(mountHeight(island({ kind: "banner" }))).toBe(1200)
    expect(mountHeight(island())).toBe(0)
    expect(mountHeight(island({ kind: "banner", mountHeight: 2000 }))).toBe(2000)
  })

  it("баннер поперёк коридора проход не сужает", () => {
    const b = island({ kind: "banner", width: 3000, depth: 80, position: { x: 5000, y: 1500 } })
    expect(passageLeft(b, corridor)).toBe(Infinity)
  })

  it("площадь рекламы считается по габариту щита", () => {
    expect(islandArea(island({ kind: "banner", width: 3000, depth: 80 }))).toBeCloseTo(0.24)
  })
})

describe("прижим к стенам", () => {
  // комната 6 × 4 м по внутренним граням
  const room = [{ x: 0, y: 0 }, { x: 6000, y: 0 }, { x: 6000, y: 4000 }, { x: 0, y: 4000 }]

  it("место, наехавшее на стену, встаёт вплотную к ней", () => {
    const isl = island({ width: 1000, depth: 800 })
    const at = clampToRoom(isl, room, { x: 5800, y: 2000 })
    expect(at.x).toBeCloseTo(5500, 0) // 6000 − половина ширины
    expect(at.y).toBeCloseTo(2000, 0)
    const poly = islandPolygon({ ...isl, position: at })
    expect(Math.max(...poly.map((p) => p.x))).toBeLessThanOrEqual(6000.5)
  })

  it("угол комнаты: место прижимается сразу к двум стенам", () => {
    const isl = island({ width: 1000, depth: 800 })
    const at = clampToRoom(isl, room, { x: -500, y: -500 })
    expect(at.x).toBeCloseTo(500, 0)
    expect(at.y).toBeCloseTo(400, 0)
  })

  it("место внутри комнаты не двигается", () => {
    const isl = island({ width: 1000, depth: 800 })
    expect(clampToRoom(isl, room, { x: 3000, y: 2000 })).toEqual({ x: 3000, y: 2000 })
  })

  it("зазор до стены соблюдается", () => {
    const isl = island({ width: 1000, depth: 800 })
    const at = clampToRoom(isl, room, { x: 5800, y: 2000 }, 100)
    expect(at.x).toBeCloseTo(5400, 0)
  })

  it("повёрнутое место прижимается по своему габариту", () => {
    const isl = island({ width: 2000, depth: 600, rotationDeg: 90 })
    const at = clampToRoom(isl, room, { x: 3000, y: 3900 })
    const poly = islandPolygon({ ...isl, position: at })
    expect(Math.max(...poly.map((p) => p.y))).toBeLessThanOrEqual(4000.5)
  })
})
