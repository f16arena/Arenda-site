import { describe, expect, it } from "vitest"
import { ductSection, deviceHeight, MEP_DEVICE_BY_KIND, MEP_DEVICES, MEP_SYSTEM_INFO, runDiameterMm } from "./catalog"
import { mepSpec } from "./spec"
import { MEP_SYSTEMS } from "@/types/builder"

import { createTranslator } from "@/lib/i18n/translate"
import { ru } from "@/lib/i18n/messages"

// Тексты на листах собираются переводчиком — в тестах берём русский словарь.
const { t } = createTranslator("ru", ru)

describe("каталог сетей", () => {
  it("у каждой системы есть приборы, виды приборов не повторяются", () => {
    for (const s of MEP_SYSTEMS) {
      expect(MEP_SYSTEM_INFO[s]).toBeTruthy()
      expect(MEP_DEVICES.some((d) => d.system === s)).toBe(true)
    }
    expect(new Set(MEP_DEVICES.map((d) => d.kind)).size).toBe(MEP_DEVICES.length)
  })

  it("размеры из марки", () => {
    expect(runDiameterMm("water", "PP-R Ø32")).toBe(32)
    expect(runDiameterMm("heating", "Сталь Ду20")).toBe(20)
    expect(ductSection("500×300")).toEqual({ w: 500, h: 300 })
    expect(ductSection("Ø200")).toEqual({ w: 200, h: 200 })
  })

  it("светильник под потолком этажа", () => {
    expect(deviceHeight(MEP_DEVICE_BY_KIND.lamp, 3000)).toBe(3000 - 80 - 50)
    expect(deviceHeight(MEP_DEVICE_BY_KIND.socket, 3000)).toBe(300)
  })
})

describe("спецификация", () => {
  it("считает штуки, метры и мощность по системам", () => {
    const spec = mepSpec({
      mepDevices: [
        { id: "1", system: "power", kind: "socket", at: { x: 0, y: 0 }, height: 300, rotation: 0, label: "" },
        { id: "2", system: "power", kind: "socket", at: { x: 1, y: 0 }, height: 300, rotation: 0, label: "" },
        { id: "3", system: "power", kind: "panel", at: { x: 2, y: 0 }, height: 1500, rotation: 0, label: "ЩР-1", power: 5000 },
        { id: "4", system: "water", kind: "sink", at: { x: 2, y: 0 }, height: 850, rotation: 0, label: "" },
      ],
      mepRuns: [
        { id: "r1", system: "power", points: [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 4000 }], height: 2800, size: "", label: "" },
        { id: "r2", system: "power", points: [{ x: 0, y: 0 }, { x: 1500, y: 0 }], height: 2800, size: "", label: "" },
      ],
    }, t)
    expect(spec.map((s) => s.system)).toEqual(["power", "water"])
    const p = spec[0]
    expect(p.devices).toBe(3)
    expect(p.powerW).toBe(300 + 300 + 5000)
    expect(p.lengthM).toBe(8.5)
    expect(p.rows).toEqual([
      { system: "power", name: "Розетка", unit: "pcs", qty: 2 },
      { system: "power", name: "Щит распределительный", unit: "pcs", qty: 1 },
      { system: "power", name: "Кабель ВВГнг(А)-LS 3×2,5", unit: "m", qty: 8.5 },
    ])
  })
})

describe("привязки сетей", async () => {
  const { snapMepPoint, wallMount } = await import("./snap")
  it("к прибору, потом угол 45°, потом сетка", () => {
    expect(snapMepPoint({ x: 1090, y: 20 }, null, { targets: [{ x: 1000, y: 0 }], tolMm: 150, snap: true }).at).toEqual({ x: 1000, y: 0 })
    const a = snapMepPoint({ x: 2980, y: 130 }, { x: 0, y: 0 }, { targets: [], tolMm: 150, snap: true })
    expect(a).toEqual({ at: { x: 3000, y: 0 }, kind: "angle" })
    const d = snapMepPoint({ x: 1010, y: 990 }, { x: 0, y: 0 }, { targets: [], tolMm: 150, snap: true })
    expect(d.at.x).toBe(d.at.y)
    expect(snapMepPoint({ x: 1234, y: 777 }, null, { targets: [], tolMm: 150, snap: true }).at).toEqual({ x: 1250, y: 800 })
  })

  it("розетка прижимается к грани стены лицом в комнату", () => {
    const g = {
      nodes: { a: { id: "a", x: 0, y: 0 }, b: { id: "b", x: 4000, y: 0 } },
      edges: { e: { id: "e", a: "a", b: "b", thickness: 200, height: 3000, kind: "interior" } },
    } as never
    const m = wallMount({ x: 1500, y: 600 }, g, 40)
    expect(m?.at).toEqual({ x: 1500, y: 120 })
    // лицо (+y локально) смотрит к курсору: r = 0
    expect(Math.abs(m?.rotation ?? 1)).toBe(0)
    const below = wallMount({ x: 1500, y: -600 }, g, 40)
    expect(below?.at).toEqual({ x: 1500, y: -120 })
    expect(Math.abs(below?.rotation ?? 0)).toBe(180)
    expect(wallMount({ x: 1500, y: 5000 }, g, 40)).toBeNull()
  })
})
