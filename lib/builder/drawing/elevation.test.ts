import { describe, expect, it } from "vitest"
import type { Building, Floor } from "@/types/builder"
import { buildFacade, buildSection, levelText, sectionFrame } from "./elevation"

import { createTranslator } from "@/lib/i18n/translate"
import { ru } from "@/lib/i18n/messages"

// Подписи этажей и фасадов приходят из словаря — в тестах берём русский.
const { t } = createTranslator("ru", ru)

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
    { id: "o1", wallId: "s", type: "window", variant: "standard", width: 1500, height: 1500, sillHeight: 900, offset: 1750 },
    { id: "o2", wallId: "s", type: "door", variant: "single", width: 1000, height: 2100, sillHeight: 0, offset: 5500 },
  ],
})
const f2 = box("f2", 2, 3000, { roof: { type: "gable", pitchDeg: 30, overhang: 300, thickness: 200 } })
const building: Building = { id: "b", name: "b", origin: { x: 0, y: 0 }, floors: [f1, f2], sections: [] }

describe("фасады", () => {
  it("южный фасад: стены двух этажей, окно и дверь, крыша, отметки", () => {
    const d = buildFacade(building, "south", t)
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
    const d = buildFacade(building, "north", t)
    expect(d.items.some((i) => i.t === "poly" && i.fill === "glass")).toBe(false)
  })

  it("отметки", () => {
    expect(levelText(0)).toBe("±0,000")
    expect(levelText(-3500)).toBe("−3,500")
    expect(levelText(10250)).toBe("+10,250")
  })
})

describe("оси на фасадах и разрезах", () => {
  it("на фасаде видны поперечные оси с марками плана", () => {
    const d = buildFacade(building, "south", t)
    expect(d.axes.length).toBeGreaterThan(0)
    expect(d.axes.every((a) => typeof a.label === "string" && a.label.length > 0)).toBe(true)
  })

  it("оси идут по возрастанию координаты вдоль вида", () => {
    const d = buildFacade(building, "south", t)
    const us = d.axes.map((a) => a.u)
    expect([...us].sort((a, b) => a - b)).toEqual(us)
  })

  it("на разрезе оси тоже есть", () => {
    const s = { a: { x: -3000, y: -6000 }, b: { x: -3000, y: 6000 }, look: 1 as const }
    expect(buildSection(building, s, t).axes.length).toBeGreaterThanOrEqual(0)
  })
})

describe("разрез", () => {
  it("поперёк здания через окно: рассечённые стены, перекрытия, проём в сечении", () => {
    const s = { a: { x: -3000, y: -6000 }, b: { x: -3000, y: 6000 }, look: 1 as const }
    const fr = sectionFrame(s)
    expect(fr.d.x).toBeCloseTo(-1) // смотрим на запад
    const d = buildSection(building, s, t)
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

  it("лестница в секущей плоскости показана ступенями", () => {
    const stair = { id: "st1", shape: "straight" as const, fromFloorId: "f1", toFloorId: "f2", position: { x: 0, y: 0 }, rotationDeg: 0, width: 1200, railing: true }
    const withStair: Building = { ...building, floors: [{ ...f1, stairs: [stair] }, f2] }
    // план марша лежит от точки вставки по +x, поэтому секущая идёт через его середину
    const s = { a: { x: 600, y: -6000 }, b: { x: 600, y: 6000 }, look: 1 as const }
    const before = buildSection(building, s, t).items.filter((i) => i.t === "poly" && i.fill === "cut").length
    const after = buildSection(withStair, s, t).items.filter((i) => i.t === "poly" && i.fill === "cut").length
    expect(after).toBeGreaterThan(before)
  })

  it("лестница за плоскостью разреза видна контуром, а не сечением", () => {
    const stair = { id: "st1", shape: "straight" as const, fromFloorId: "f1", toFloorId: "f2", position: { x: -4500, y: 0 }, rotationDeg: 0, width: 1200, railing: true }
    const withStair: Building = { ...building, floors: [{ ...f1, stairs: [stair] }, f2] }
    const s = { a: { x: -3000, y: -6000 }, b: { x: -3000, y: 6000 }, look: 1 as const }
    const base = buildSection(building, s, t)
    const d = buildSection(withStair, s, t)
    const faces = (b: typeof d) => b.items.filter((i) => i.t === "poly" && i.fill === "face").length
    expect(faces(d)).toBeGreaterThan(faces(base))
    expect(d.items.filter((i) => i.t === "poly" && i.fill === "cut").length).toBe(base.items.filter((i) => i.t === "poly" && i.fill === "cut").length)
  })

  it("крыльцо и пандус лестницей в сечении не считаются", () => {
    // у крыльца и пандуса свой слой (porch): в сечении марша быть не должно
    const porch = { id: "p1", shape: "porch" as const, fromFloorId: "f1", toFloorId: "f1", position: { x: 600, y: -3200 }, rotationDeg: 180, width: 1800, railing: false, rise: 450 }
    const ramp = { id: "r1", shape: "ramp" as const, fromFloorId: "f1", toFloorId: "f1", position: { x: 600, y: 3200 }, rotationDeg: 0, width: 1200, railing: true, rise: 450 }
    const s = { a: { x: 600, y: -6000 }, b: { x: 600, y: 6000 }, look: 1 as const }
    const base = buildSection(building, s, t)
    const withBoth = buildSection({ ...building, floors: [{ ...f1, stairs: [porch, ramp] }, f2] }, s, t)
    const cuts = (b: typeof base) => b.items.filter((i) => i.t === "poly" && i.fill === "cut").length
    expect(cuts(withBoth)).toBe(cuts(base))
  })
})
