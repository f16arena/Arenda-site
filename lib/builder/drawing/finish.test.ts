import { describe, expect, it } from "vitest"
import { emptyGraph, insertWall } from "@/core/geometry/wall-graph"
import { finishSchedule, floorTypes } from "./finish"
import { buildEvacuation } from "./evacuation"
import { floorRooms } from "@/lib/builder/rooms"
import type { Floor } from "@/types/builder"

import { createTranslator } from "@/lib/i18n/translate"
import { ru } from "@/lib/i18n/messages"

// Тексты на листах собираются переводчиком — в тестах берём русский словарь.
const { t } = createTranslator("ru", ru)

// две комнаты 5×4 м с дверью наружу и дверью между ними
function floor(): Floor {
  let g = emptyGraph()
  const ext = { thickness: 400, height: 3000, kind: "exterior" as const }
  const int = { thickness: 200, height: 3000, kind: "interior" as const, interiorMaterialId: "paint_white" }
  const pts: Array<[number, number]> = [[0, 0], [10000, 0], [10000, 4000], [0, 4000], [0, 0]]
  for (let i = 0; i < 4; i++) g = insertWall(g, { x: pts[i][0], y: pts[i][1] }, { x: pts[i + 1][0], y: pts[i + 1][1] }, ext).graph
  g = insertWall(g, { x: 5000, y: 0 }, { x: 5000, y: 4000 }, int).graph
  const south = Object.values(g.edges).find((e) => g.nodes[e.a].y === 0 && g.nodes[e.b].y === 0)!
  const mid = Object.values(g.edges).find((e) => g.nodes[e.a].x === 5000 && g.nodes[e.b].x === 5000)!
  return {
    id: "f", name: "1", level: 1, elevation: 0, height: 3000, visible: true, locked: false, opacity: 1, wallGraph: g,
    openings: [
      { id: "o1", wallId: south.id, type: "door", variant: "single", width: 1000, height: 2100, sillHeight: 0, offset: 2500, exit: "main" },
      { id: "o2", wallId: mid.id, type: "door", variant: "single", width: 900, height: 2100, sillHeight: 0, offset: 2000 },
    ],
    stairs: [], objects: [], premiseLinks: {}, roomMaterials: {}, mepRuns: [], mepDevices: [],
    floorMaterialId: "tile_gray",
  } as Floor
}

describe("ведомость отделки", () => {
  it("площадь пола и стен, материалы из модели", () => {
    const rows = finishSchedule(floor(), t)
    expect(rows).toHaveLength(2)
    const r = rows[0]
    expect(r.floor).toBe("Плитка сер.")
    expect(r.walls).toBe("Краска бел.")
    expect(r.floorM2).toBeGreaterThan(10)
    expect(r.wallsM2).toBeGreaterThan(r.floorM2)
  })
  it("экспликация полов сводит помещения по типу покрытия", () => {
    const types = floorTypes(floor(), t)
    expect(types).toHaveLength(1)
    expect(types[0].covering).toBe("Плитка сер.")
    expect(types[0].layers).toContain("стяжка")
  })
})

describe("план эвакуации", () => {
  it("из дальней комнаты путь идёт через дверь к выходу наружу", () => {
    const f = floor()
    const plan = buildEvacuation(f)
    expect(plan.exits).toHaveLength(1)
    expect(plan.extinguishers).toHaveLength(1)
    expect(plan.routes.length).toBe(floorRooms(f).length)
    // длинный путь — из комнаты без наружной двери: минимум 3 точки
    expect(Math.max(...plan.routes.map((r) => r.length))).toBeGreaterThanOrEqual(3)
    expect(plan.isolated).toEqual([])
  })
})
