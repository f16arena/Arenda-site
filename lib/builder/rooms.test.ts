import { describe, expect, it } from "vitest"
import { emptyGraph, insertWall } from "@/core/geometry/wall-graph"
import { floorRooms } from "./rooms"
import type { Floor } from "@/types/builder"

function room(): Floor {
  let g = emptyGraph()
  const p = [[0, 0], [10000, 0], [10000, 10000], [0, 10000], [0, 0]]
  for (let i = 0; i < 4; i++) g = insertWall(g, { x: p[i][0], y: p[i][1] }, { x: p[i + 1][0], y: p[i + 1][1] }, { thickness: 300, height: 3000, kind: "exterior" }).graph
  return { id: "f", name: "1", level: 1, elevation: 0, height: 3000, visible: true, locked: false, opacity: 1, wallGraph: g, openings: [], objects: [], premiseLinks: {}, roomMaterials: {}, mepRuns: [], mepDevices: [],
    stairs: [
      { id: "c1", shape: "column", fromFloorId: "f", toFloorId: "f", position: { x: 5000, y: 5000 }, rotationDeg: 0, width: 500, depth: 500, railing: false }, // целиком внутри: 0,25 м²
      { id: "c2", shape: "column", fromFloorId: "f", toFloorId: "f", position: { x: 0, y: 3000 }, rotationDeg: 0, width: 600, depth: 600, railing: false }, // половина в стене: 0,18 м² внутри
    ] }
}

describe("площадь помещения за вычетом колонн", () => {
  it("колонна внутри — целиком, колонна в стене — только выступающей частью", () => {
    const [r] = floorRooms(room())
    // площадь по внутренним граням: 10 м по осям − 0,3 м стен = 9,7 × 9,7 м;
    // колонна у стены выступает в помещение только частью
    expect(r.columnsMm2 / 1e6).toBeCloseTo(0.25 + 0.09, 3)
    expect(r.areaMm2 / 1e6).toBeCloseTo(9.7 * 9.7 - 0.34, 2)
  })
})
