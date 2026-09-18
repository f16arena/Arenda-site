import { describe, expect, it } from "vitest"
import { emptyGraph, insertWall } from "@/core/geometry/wall-graph"
import { lintelSchedule } from "./lintels"
import type { Floor } from "@/types/builder"

function floor(): Floor {
  let g = emptyGraph()
  const ext = { thickness: 400, height: 3000, kind: "exterior" as const }
  const part = { thickness: 120, height: 3000, kind: "partition" as const }
  g = insertWall(g, { x: 0, y: 0 }, { x: 8000, y: 0 }, ext).graph
  g = insertWall(g, { x: 0, y: 4000 }, { x: 8000, y: 4000 }, part).graph
  const [wall, thin] = Object.values(g.edges)
  return {
    id: "f", name: "1", level: 1, elevation: 0, height: 3000, visible: true, locked: false, opacity: 1, wallGraph: g,
    openings: [
      { id: "w1", wallId: wall.id, type: "window", variant: "double", width: 1500, height: 1500, sillHeight: 800, offset: 2000 },
      { id: "d1", wallId: wall.id, type: "door", variant: "single", width: 900, height: 2100, sillHeight: 0, offset: 5000 },
      { id: "d2", wallId: thin.id, type: "door", variant: "single", width: 900, height: 2100, sillHeight: 0, offset: 3000 },
    ],
    stairs: [], objects: [], premiseLinks: {}, roomMaterials: {}, mepRuns: [], mepDevices: [],
  } as Floor
}

describe("ведомость перемычек", () => {
  it("подбирает длину по ширине проёма с опиранием 250 мм, марки по порядку", () => {
    const rows = lintelSchedule([floor()])
    expect(rows.map((r) => r.mark)).toEqual(["ПР-1", "ПР-2"])
    // окно 1500 + 2×250 = 2000 → ближайшая длина 2070
    expect(rows.some((r) => r.length === 2070)).toBe(true)
    // дверь 900 + 500 = 1400 → 1550
    expect(rows.some((r) => r.length === 1550)).toBe(true)
  })
  it("перегородка 120 мм перемычек не требует", () => {
    const rows = lintelSchedule([floor()])
    // всего проёмов в несущей стене — два
    expect(rows.reduce((s, r) => s + r.openings, 0)).toBe(2)
  })
  it("в стене 400 мм перемычки укладываются в несколько рядов", () => {
    const rows = lintelSchedule([floor()])
    expect(rows.every((r) => r.perOpening >= 3)).toBe(true)
  })
})
