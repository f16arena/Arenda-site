import { describe, expect, it } from "vitest"
import { emptyGraph, insertWall } from "@/core/geometry/wall-graph"
import { buildingIndicators, footprintArea } from "./indicators"
import type { Floor } from "@/types/builder"

function floor(id: string, level: number, elevation: number): Floor {
  let g = emptyGraph()
  const def = { thickness: 400, height: 3000, kind: "exterior" as const }
  const pts: Array<[number, number]> = [[0, 0], [10000, 0], [10000, 6000], [0, 6000], [0, 0]]
  for (let i = 0; i < 4; i++) g = insertWall(g, { x: pts[i][0], y: pts[i][1] }, { x: pts[i + 1][0], y: pts[i + 1][1] }, def).graph
  return { id, name: `${level}`, level, elevation, height: 3000, visible: true, locked: false, opacity: 1, wallGraph: g, openings: [], stairs: [], objects: [], premiseLinks: {}, roomMaterials: {}, mepRuns: [], mepDevices: [] } as Floor
}

describe("показатели здания", () => {
  it("площадь застройки по внешней грани", () => {
    // оси 10×6 м = 60 м², периметр 32 м × 0,2 м = 6,4 м² → 66,4
    expect(footprintArea(floor("f", 1, 0).wallGraph)).toBeCloseTo(66.4, 1)
  })
  it("этажность, объём и площади", () => {
    const ind = buildingIndicators({ floors: [floor("f1", 1, 0), floor("f2", 2, 3000)] })
    expect(ind.floors).toBe(2)
    expect(ind.above).toBe(2)
    expect(ind.heightM).toBeCloseTo(6, 1)
    expect(ind.volumeM3).toBe(Math.round(66.4 * 6))
    // помещение внутри: 9,6 × 5,6 м на двух этажах
    expect(ind.rentM2).toBeCloseTo(9.6 * 5.6 * 2, 0)
    expect(ind.commonM2).toBe(0)
  })
})
