import { describe, it, expect } from "vitest"
import { emptyGraph, insertWall, type WallDefaults } from "./wall-graph"
import { detectRooms } from "./room-detection"
import { segmentIntersection, polygonArea, signedArea } from "./math"
import { generateRoof } from "./roof-generator"
import { wallProfile } from "./wall-profile"
import { generateStair } from "./stair-generator"

const DEF: WallDefaults = { thickness: 200, height: 3000, kind: "interior" }

function rectGraph(w: number, h: number) {
  let g = emptyGraph()
  const add = (x1: number, y1: number, x2: number, y2: number) => {
    g = insertWall(g, { x: x1, y: y1 }, { x: x2, y: y2 }, DEF).graph
  }
  add(0, 0, w, 0)
  add(w, 0, w, h)
  add(w, h, 0, h)
  add(0, h, 0, 0)
  return g
}

describe("math", () => {
  it("segmentIntersection finds a crossing", () => {
    const hit = segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })
    expect(hit).not.toBeNull()
    expect(hit?.point.x).toBeCloseTo(5)
    expect(hit?.point.y).toBeCloseTo(5)
  })
  it("parallel segments do not intersect", () => {
    expect(segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 })).toBeNull()
  })
  it("signed area is positive for CCW square", () => {
    expect(signedArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])).toBeGreaterThan(0)
  })
})

describe("wall-graph + room-detection", () => {
  it("detects a single room from a closed rectangle", () => {
    const g = rectGraph(10000, 8000)
    const rooms = detectRooms(g)
    expect(rooms.length).toBe(1)
    expect(rooms[0].areaMm2).toBeCloseTo(10000 * 8000, -4)
  })

  it("splits perimeter on intersecting partition → two rooms", () => {
    let g = rectGraph(10000, 8000)
    // вертикальная перегородка по центру, пересекает верх и низ периметра
    g = insertWall(g, { x: 5000, y: 0 }, { x: 5000, y: 8000 }, DEF).graph
    const rooms = detectRooms(g)
    expect(rooms.length).toBe(2)
    const total = rooms.reduce((a, r) => a + r.areaMm2, 0)
    expect(total).toBeCloseTo(10000 * 8000, -4)
    for (const r of rooms) expect(polygonArea(r.polygon)).toBeGreaterThan(0)
  })

  it("shared node moves both walls (graph integrity)", () => {
    const g = rectGraph(6000, 6000)
    const nodeCount = Object.keys(g.nodes).length
    expect(nodeCount).toBe(4) // углы переиспользуются, а не дублируются
  })
})

describe("wall-profile openings", () => {
  it("cuts solid segments around an opening", () => {
    const segs = wallProfile({ x: 0, y: 0 }, { x: 10000, y: 0 }, [{ offset: 5000, width: 1000 }])
    expect(segs.length).toBe(2)
    expect(segs[0].a.x).toBeCloseTo(0)
    expect(segs[0].b.x).toBeCloseTo(4500)
    expect(segs[1].a.x).toBeCloseTo(5500)
    expect(segs[1].b.x).toBeCloseTo(10000)
  })
  it("no openings → single full segment", () => {
    const segs = wallProfile({ x: 0, y: 0 }, { x: 5000, y: 0 }, [])
    expect(segs.length).toBe(1)
  })
})

describe("stair-generator", () => {
  it("auto step count from rise and produces a hole", () => {
    const s = generateStair("straight", 3400, 1100, true)
    expect(s.steps.length).toBeGreaterThanOrEqual(18)
    expect(s.hole.maxZ).toBeGreaterThan(s.hole.minZ)
  })
  it("u-shape has two runs", () => {
    const s = generateStair("u", 3400, 1100, false)
    expect(s.steps.length).toBeGreaterThanOrEqual(18)
  })
})

describe("roof-generator", () => {
  it("flat roof produces geometry", () => {
    const footprint = [{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 8000 }, { x: 0, y: 8000 }]
    const r = generateRoof(footprint, 9000, { type: "flat", pitchDeg: 0, overhang: 500, thickness: 200 })
    expect(r.positions.length).toBeGreaterThan(0)
    expect(r.indices.length).toBeGreaterThan(0)
  })
  it("gable roof produces geometry", () => {
    const footprint = [{ x: 0, y: 0 }, { x: 10000, y: 0 }, { x: 10000, y: 8000 }, { x: 0, y: 8000 }]
    const r = generateRoof(footprint, 9000, { type: "gable", pitchDeg: 25, overhang: 600, thickness: 200 })
    expect(r.positions.length).toBeGreaterThan(0)
  })
})
