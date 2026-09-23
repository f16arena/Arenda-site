import { describe, expect, it } from "vitest"
import { buildMepDrawing, sectionSystems, sectionsWithContent } from "./mep-drawing"

import { createTranslator } from "@/lib/i18n/translate"
import { ru } from "@/lib/i18n/messages"

// Тексты на листах собираются переводчиком — в тестах берём русский словарь.
const { t } = createTranslator("ru", ru)

const floor = {
  mepRuns: [
    { id: "r1", system: "water" as const, points: [{ x: 0, y: 0 }, { x: 0, y: 5000 }, { x: 1000, y: 5000 }], height: 400, size: "PP-R Ø25", label: "" },
    { id: "r2", system: "power" as const, points: [{ x: 0, y: 0 }, { x: 4000, y: 0 }], height: 2800, size: "", label: "гр.1" },
  ],
  mepDevices: [
    { id: "d1", system: "water" as const, kind: "sink", at: { x: 1000, y: 5000 }, height: 850, rotation: 90, label: "" },
    { id: "d2", system: "sewer" as const, kind: "riserK1", at: { x: 0, y: 0 }, height: 0, rotation: 0, label: "Ст К1-1" },
  ],
}

describe("лист сетей", () => {
  it("раздел ВК берёт только водопровод и канализацию", () => {
    expect(sectionSystems("ВК")).toEqual(["water", "hotwater", "sewer"])
    const d = buildMepDrawing(floor, "ВК", t)
    expect(d.runs.map((r) => r.system)).toEqual(["water"])
    expect(d.devices.map((x) => x.kind)).toEqual(["sink", "riserK1"])
    // марка — на самом длинном участке, текст снизу вверх
    expect(d.runs[0].tag).toBe("В1")
    expect(d.runs[0].tagAt).toEqual({ x: 0, y: 2500 })
    expect(d.runs[0].tagAngle).toBe(90)
    expect(d.legend.map((l) => l.text)).toEqual(["В1 — водопровод холодный", "Умывальник", "Стояк К1"])
    expect(d.spec.map((s) => s.system)).toEqual(["water", "sewer"])
  })

  it("группа в марке и разделы с содержимым", () => {
    const d = buildMepDrawing(floor, "ЭМ", t)
    expect(d.runs[0].tag).toBe("ЭМ гр.1")
    expect(buildMepDrawing(floor, "ar", t).runs).toHaveLength(0)
    expect(sectionsWithContent(floor)).toEqual(["ЭМ", "ВК"])
  })
})
