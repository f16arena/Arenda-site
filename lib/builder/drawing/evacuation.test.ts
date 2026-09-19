import { describe, expect, it } from "vitest"
import { buildEvacuation } from "./evacuation"
import type { Floor } from "@/types/builder"

/** Два помещения 6×4 и 6×4 через перегородку с дверью; наружная дверь — по флагу. */
function floor(extra: Partial<Floor> = {}): Floor {
  const nodes = {
    a: { id: "a", x: 0, y: 0 },
    b: { id: "b", x: 12000, y: 0 },
    c: { id: "c", x: 12000, y: 9000 },
    d: { id: "d", x: 0, y: 9000 },
    e: { id: "e", x: 6000, y: 0 },
    f: { id: "f", x: 6000, y: 9000 },
  }
  const w = (id: string, p: string, q: string, kind: "exterior" | "partition" = "exterior") => ({ id, a: p, b: q, thickness: kind === "exterior" ? 400 : 120, height: 3000, kind })
  return {
    id: "f1",
    name: "2 этаж",
    level: 2,
    elevation: 3500,
    height: 3300,
    visible: true,
    locked: false,
    opacity: 1,
    wallGraph: {
      nodes,
      edges: {
        w1: w("w1", "a", "e"),
        w2: w("w2", "e", "b"),
        w3: w("w3", "b", "c"),
        w4: w("w4", "c", "f"),
        w5: w("w5", "f", "d"),
        w6: w("w6", "d", "a"),
        w7: w("w7", "e", "f", "partition"),
      },
    },
    openings: [
      { id: "dr", wallId: "w7", type: "door", variant: "single", width: 900, height: 2100, sillHeight: 0, offset: 2000 },
    ],
    stairs: [],
    objects: [],
    premiseLinks: {},
    roomMaterials: {},
    mepRuns: [],
    mepDevices: [],
    ...extra,
  } as unknown as Floor
}

const stair = (over: Record<string, unknown> = {}) => ({
  id: "st1",
  shape: "u",
  fromFloorId: "f1",
  toFloorId: "f0",
  position: { x: 1500, y: 1500 },
  rotationDeg: 0,
  width: 1100,
  railing: true,
  ...over,
})

describe("план эвакуации верхнего этажа", () => {
  it("без наружных дверей и без лестницы путей нет", () => {
    const e = buildEvacuation(floor())
    expect(e.exits).toHaveLength(0)
    expect(e.routes).toHaveLength(0)
  })

  it("лестница на этаже даёт выход: появляются пути и отметка «на лестницу»", () => {
    const e = buildEvacuation(floor({ stairs: [stair()] } as unknown as Partial<Floor>))
    expect(e.stairExits.length).toBe(1)
    expect(e.routes.length).toBeGreaterThan(0)
  })

  it("лифт выходом не считается", () => {
    const e = buildEvacuation(floor({ stairs: [stair({ shape: "elevator" })] } as unknown as Partial<Floor>))
    expect(e.stairExits).toHaveLength(0)
    expect(e.routes).toHaveLength(0)
  })

  it("соседнее помещение эвакуируется через дверь к лестнице", () => {
    const e = buildEvacuation(floor({ stairs: [stair()] } as unknown as Partial<Floor>))
    // путь из дальнего помещения длиннее: он идёт через дверь в перегородке
    expect(Math.max(...e.routes.map((r) => r.length))).toBeGreaterThan(2)
    expect(e.isolated).toHaveLength(0)
  })

  it("огнетушитель ставится у выхода на лестницу", () => {
    const e = buildEvacuation(floor({ stairs: [stair()] } as unknown as Partial<Floor>))
    expect(e.extinguishers).toHaveLength(1)
  })
})
