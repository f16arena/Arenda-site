import { describe, expect, it } from "vitest"
import type { Building, Floor } from "@/types/builder"
import { buildFacade, buildSection, levelText, sectionFrame } from "./elevation"

function box(id: string, level: number, elevation: number, extra: Partial<Floor> = {}): Floor {
  const nodes = {
    a: { id: "a", x: -5000, y: -3000 }, b: { id: "b", x: 5000, y: -3000 },
    c: { id: "c", x: 5000, y: 3000 }, d: { id: "d", x: -5000, y: 3000 },
  }
  const e = (eid: string, a: string, b: string) => ({ id: eid, a, b, thickness: 400, height: 3000, kind: "exterior" as const })
  return {
    id, name: `${level}`, level, elevation, height: 3000, visible: true, locked: false, opacity: 1,
    wallGraph: { nodes, edges: { s: e("s", "a", "b"), ea: e("ea", "b", "c"), n: e("n", "c", "d"), w: e("w", "d", "a") } },
    openings: [], stairs: [], objects: [], premiseLinks: {}, roomMaterials: {}, mepRuns: [], mepDevices: [],
    ...extra,
  }
}

const f1 = box("f1", 1, 0, {
  openings: [
    { id: "o1", wallId: "s", type: "window", variant: "standard", width: 1500, height: 1500, sillHeight: 900, offset: 1000 },
    { id: "o2", wallId: "s", type: "door", variant: "single", width: 1000, height: 2100, sillHeight: 0, offset: 5000 },
  ],
})
const f2 = box("f2", 2, 3000, { roof: { type: "gable", pitchDeg: 30, overhang: 300, thickness: 200 } })
const building: Building = { id: "b", name: "b", origin: { x: 0, y: 0 }, floors: [f1, f2], sections: [] }

describe("фасады", () => {
  it("южный фасад: стены двух этажей, окно и дверь, крыша, отметки", () => {
    const d = buildFacade(building, "south")
    const polys = d.items.filter((i) => i.t === "poly")
    expect(polys.filter((p) => p.t === "poly" && p.fill === "glass")).toHaveLength(1)
    expect(polys.filter((p) => p.t === "poly" && p.fill === "opening")).toHaveLength(1)
    expect(polys.some((p) => p.t === "poly" && p.fill === "roof")).toBe(true)
    // смотрим с юга: запад слева
    expect(d.bounds.minU).toBeLessThan(-4900)
    expect(d.bounds.maxU).toBeGreaterThan(4900)
    expect(d.marks.map((m) => m.text)).toContain("±0,000")
    expect(d.marks.map((m) => m.text)).toContain("+6,000")
    // конёк двускатной крыши выше верха стен
    expect(d.bounds.maxZ).toBeGreaterThan(6500)
    // окно южной стены: от 1000 до 2500 мм от западного угла
    const glass = polys.find((p) => p.t === "poly" && p.fill === "glass")
    const us = glass && glass.t === "poly" ? glass.pts.map((p) => p.x) : []
    expect(Math.min(...us)).toBeCloseTo(-4000)
    expect(Math.max(...us)).toBeCloseTo(-2500)
  })

  it("северный фасад окон не показывает, стены зеркально", () => {
    const d = buildFacade(building, "north")
    expect(d.items.some((i) => i.t === "poly" && i.fill === "glass")).toBe(false)
  })

  it("отметки", () => {
    expect(levelText(0)).toBe("±0,000")
    expect(levelText(-3500)).toBe("−3,500")
    expect(levelText(10250)).toBe("+10,250")
  })
})

describe("разрез", () => {
  it("поперёк здания через окно: рассечённые стены, перекрытия, проём в сечении", () => {
    const s = { a: { x: -3000, y: -6000 }, b: { x: -3000, y: 6000 }, look: 1 as const }
    const fr = sectionFrame(s)
    expect(fr.d.x).toBeCloseTo(-1) // смотрим на запад
    const d = buildSection(building, s)
    const cut = d.items.filter((i) => i.t === "poly" && i.fill === "cut")
    // южная стена 1 этажа разрезана окном на две части + северная + две стены 2 этажа
    expect(cut).toHaveLength(5)
    const slabs = d.items.filter((i) => i.t === "poly" && i.fill === "slab")
    expect(slabs).toHaveLength(2)
    // стена за разрезом (западная) видна гранью
    expect(d.items.some((i) => i.t === "poly" && i.fill === "face")).toBe(true)
    // крыша рассечена
    expect(d.items.some((i) => i.t === "line" && i.weight === "thick" && i.a.y > 6000)).toBe(true)
  })
})
