import { describe, expect, it } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import type { Floor } from "@/types/builder"
import { emptyGraph, insertWall } from "@/core/geometry/wall-graph"
import { buildFloorDrawing, pickSheet } from "./floor-drawing"
import { floorDrawingToDxf } from "./dxf"

/** Коробка 12 × 6 м по осям, наружные стены 400, перегородка на x = 5000, окно и дверь. */
function box(): Floor {
  let g = emptyGraph()
  const ext = { thickness: 400, height: 3000, kind: "exterior" as const }
  const pts = [[0, 0], [12000, 0], [12000, 6000], [0, 6000], [0, 0]]
  for (let i = 0; i < 4; i++) g = insertWall(g, { x: pts[i][0], y: pts[i][1] }, { x: pts[i + 1][0], y: pts[i + 1][1] }, ext).graph
  g = insertWall(g, { x: 5000, y: 0 }, { x: 5000, y: 6000 }, { thickness: 120, height: 3000, kind: "partition" }).graph
  const top = Object.values(g.edges).find((e) => g.nodes[e.a].y === 6000 && g.nodes[e.b].y === 6000 && Math.max(g.nodes[e.a].x, g.nodes[e.b].x) === 12000)!
  const part = Object.values(g.edges).find((e) => e.kind === "partition")!
  const a = g.nodes[top.a]
  const offset = a.x === 5000 ? 2000 : 7000 - 2000 - 1500
  return {
    id: "f", name: "1 этаж", level: 1, elevation: 0, height: 3000, visible: true, locked: false, opacity: 1,
    wallGraph: g,
    openings: [
      { id: "w1", wallId: top.id, type: "window", variant: "standard", width: 1500, height: 1500, sillHeight: 900, offset },
      { id: "d1", wallId: part.id, type: "door", variant: "interior", width: 900, height: 2100, sillHeight: 0, offset: 1000 },
    ],
    stairs: [], objects: [], premiseLinks: {}, roomMaterials: {}, mepRuns: [], mepDevices: [],
  }
}

describe("чертёж плана этажа", () => {
  it("габаритный размер — наружные грани стен", () => {
    const d = buildFloorDrawing(box())
    const overall = d.dims.filter((x) => x.side === "top" && x.level === 3)
    expect(overall).toHaveLength(1)
    expect(overall[0].text).toBe("12400")
    expect(d.dims.find((x) => x.side === "left" && x.level === 3)?.text).toBe("6400")
  })

  it("цепочки сходятся с габаритом", () => {
    const d = buildFloorDrawing(box())
    for (const side of ["top", "bottom"] as const) {
      const total = Number(d.dims.find((x) => x.side === side && x.level === 3)!.text)
      for (const level of [1, 2] as const) {
        const parts = d.dims.filter((x) => x.side === side && x.level === level)
        if (parts.length === 0) continue
        expect(parts.reduce((s, x) => s + Number(x.text), 0)).toBeGreaterThanOrEqual(total - 2)
        expect(parts.reduce((s, x) => s + Number(x.text), 0)).toBeLessThanOrEqual(total + 2)
      }
    }
    // проём в верхней стене даёт цепочку 1 уровня: простенок, окно 1500, простенок
    expect(d.dims.some((x) => x.side === "top" && x.level === 1 && x.text === "1500")).toBe(true)
  })

  it("две комнаты с площадями, дверь с дугой, окно линиями", () => {
    const d = buildFloorDrawing(box())
    expect(d.rooms).toHaveLength(2)
    expect(d.arcs).toHaveLength(1)
    expect(d.arcs[0].r).toBe(900)
    expect(d.thinLines.length).toBeGreaterThanOrEqual(6)
  })

  it("оси только по наружным и несущим стенам", () => {
    const d = buildFloorDrawing(box())
    expect(d.axes.filter((a) => a.dir === "v").map((a) => a.label)).toEqual(["1", "2"])
    expect(d.axes.filter((a) => a.dir === "h").map((a) => a.label)).toEqual(["А", "Б"])
  })

  it("DXF: секции, слои, кириллица экранирована", () => {
    const f = box()
    const d = buildFloorDrawing(f, () => "101")
    f.premiseLinks = {}
    const dxf = floorDrawingToDxf(d, pickSheet(d).scale, "План 1 этажа")
    expect(dxf.startsWith("0\r\nSECTION")).toBe(true)
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true)
    expect(dxf).toContain("A-WALL")
    expect(dxf).toContain("\U+041F") // «П»
    expect(dxf).not.toMatch(/[А-Яа-я]/)
  })

  it("вытянутый этаж ложится на книжный А3", () => {
    const path = ".tmp-harness/f16-floor1.json"
    if (!existsSync(path)) return
    const f = { ...box(), ...JSON.parse(readFileSync(path, "utf8")) } as Floor
    const sheet = pickSheet(buildFloorDrawing(f))
    expect(sheet.format).toBe("A3")
    expect(sheet.orientation).toBe("portrait")
    expect(sheet.scale).toBeLessThanOrEqual(200)
  })
})
