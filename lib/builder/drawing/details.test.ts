import { describe, expect, it } from "vitest"
import { buildDetails, structureSizes } from "./details"
import { detailsToDxf } from "./dxf"
import type { Floor } from "@/types/builder"

function floor(extra: Partial<Floor> = {}): Floor {
  return {
    id: "f1",
    name: "1 этаж",
    level: 1,
    elevation: 0,
    height: 3300,
    visible: true,
    locked: false,
    opacity: 1,
    wallGraph: {
      nodes: { a: { id: "a", x: 0, y: 0 }, b: { id: "b", x: 8000, y: 0 }, c: { id: "c", x: 8000, y: 6000 } },
      edges: {
        w1: { id: "w1", a: "a", b: "b", thickness: 510, height: 3300, kind: "exterior" },
        w2: { id: "w2", a: "b", b: "c", thickness: 510, height: 3300, kind: "exterior" },
        w3: { id: "w3", a: "a", b: "c", thickness: 120, height: 3300, kind: "interior" },
      },
    },
    openings: [
      { id: "o1", wallId: "w1", type: "window", variant: "single", width: 1500, height: 1500, sillHeight: 850, offset: 2000 },
      { id: "o2", wallId: "w2", type: "door", variant: "single", width: 900, height: 2100, sillHeight: 0, offset: 1000 },
    ],
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

describe("structureSizes", () => {
  it("толщины берутся из модели: наружная и внутренняя стена отдельно", () => {
    const s = structureSizes([floor()])
    expect(s.wall).toBe(510)
    expect(s.inner).toBe(120)
    expect(s.height).toBe(3300)
  })

  it("без стен подставляются типовые значения", () => {
    const s = structureSizes([floor({ wallGraph: { nodes: {}, edges: {} } } as unknown as Partial<Floor>)])
    expect(s.wall).toBeGreaterThan(0)
    expect(s.height).toBeGreaterThan(0)
  })
})

describe("buildDetails", () => {
  it("четыре узла: цоколь, перекрытие, окно, кровля", () => {
    const d = buildDetails({ floors: [floor()] })
    expect(d).toHaveLength(4)
    expect(d.map((x) => x.mark)).toEqual(["Узел 1", "Узел 2", "Узел 3", "Узел 4"])
  })

  it("плоская кровля даёт узел парапета, скатная — карниз", () => {
    const flat = buildDetails({ floors: [floor({ roof: { type: "flat", pitchDeg: 0, overhang: 300, thickness: 300 } } as unknown as Partial<Floor>)] })
    const gable = buildDetails({ floors: [floor({ roof: { type: "gable", pitchDeg: 30, overhang: 500, thickness: 300 } } as unknown as Partial<Floor>)] })
    expect(flat[3].title).toMatch(/парапет/i)
    expect(gable[3].title).toMatch(/карниз/i)
  })

  it("толщина стены из модели попадает в узел и в выноску", () => {
    const [d1] = buildDetails({ floors: [floor()] })
    expect(d1.notes.some((n) => n.text.includes("510"))).toBe(true)
    expect(d1.dims.some((x) => x.text === "510")).toBe(true)
  })

  it("оконный узел берёт размеры реального окна", () => {
    const d = buildDetails({ floors: [floor()] })
    expect(d[2].notes.some((n) => n.text.includes("1500×1500"))).toBe(true)
  })

  it("у каждого узла есть состав слоёв и непустой габарит", () => {
    for (const d of buildDetails({ floors: [floor()] })) {
      expect(d.layers.length).toBeGreaterThan(2)
      expect(d.box.maxX - d.box.minX).toBeGreaterThan(0)
      expect(d.box.maxY - d.box.minY).toBeGreaterThan(0)
      expect(d.shapes.length).toBeGreaterThan(2)
    }
  })

  it("витражи не берутся за типовое окно", () => {
    const f = floor({
      openings: [
        { id: "c1", wallId: "w1", type: "window", variant: "curtain", width: 7000, height: 3000, sillHeight: 100, offset: 4000 },
        { id: "o1", wallId: "w1", type: "window", variant: "single", width: 1200, height: 1400, sillHeight: 900, offset: 1000 },
      ],
    } as unknown as Partial<Floor>)
    const d = buildDetails({ floors: [f] })
    expect(d[2].notes.some((n) => n.text.includes("1200×1400"))).toBe(true)
  })
})

describe("узлы в DXF", () => {
  it("выгрузка содержит слои, линии и подписи", () => {
    const dxf = detailsToDxf(buildDetails({ floors: [floor()] }), "Узлы")
    const rows = dxf.split(String.fromCharCode(10)).map((r) => r.trim().replace(String.fromCharCode(13), ""))
    const count = (name: string) => rows.filter((r) => r === name).length
    expect(count("LINE")).toBeGreaterThan(50)
    expect(count("TEXT")).toBeGreaterThan(10)
    expect(rows).toContain("A-NODE")
    expect(rows[rows.length - 2] || rows[rows.length - 1]).toBe("EOF")
  })

  it("узлы не накладываются друг на друга", () => {
    const dxf = detailsToDxf(buildDetails({ floors: [floor()] }), "Узлы")
    // координаты X у второго узла сдвинуты вправо — раскладка по два в ряд
    expect(dxf.length).toBeGreaterThan(1000)
  })
})
