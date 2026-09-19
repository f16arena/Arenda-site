import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { renderContractText, assemble, defaultState, type ContractState } from "./index"
import { LEGACY_CASES, legacyState } from "./legacy-fixture-state"
import { applyContractTypePreset } from "@/lib/contract-type-presets"
import { resolveContractTypeForTenant } from "@/lib/contract-placement-types"

const fixture = (type: string) =>
  readFileSync(resolve(__dirname, "__fixtures__", `legacy-${type}.txt`), "utf8").replace(/\r\n/g, "\n")

describe("ранее подписанные договоры не меняются", () => {
  // Документ подписанного договора перерисовывается из сохранённого состояния
  // и обязан совпадать с подписанным текстом. Эталоны сняты до появления
  // договоров на размещение.
  for (const [type, placement, area, rent] of LEGACY_CASES) {
    it(`${type} без блока placement рендерится как раньше`, () => {
      expect(renderContractText(legacyState(type, placement, area, rent))).toBe(fixture(type))
    })
  }
})

function placed(type: "EQUIPMENT" | "TERRITORY"): ContractState {
  const s = defaultState()
  s.meta.contractNumber = "01-002"
  s.meta.contractDate = "2026-09-19"
  s.landlord.name = "ТОО «F16»"
  s.tenant.name = "ИП MTA"
  s.premises.buildingAddress = "г. Усть-Каменогорск, ул. Примерная, 16"
  s.financials.monthlyRent = 30000
  s.financials.deposit.amount = 30000
  s.term.startDate = "2026-10-01"
  s.term.endDate = "2027-08-31"
  applyContractTypePreset(s, type)
  s.placement!.placeAreaSqm = 1.5
  s.placement!.placeDescription = type === "EQUIPMENT" ? "холл 1 этажа, справа от входа" : "у въезда"
  s.placement!.equipment = [{ name: type === "EQUIPMENT" ? "Торговый автомат" : "Торговый киоск", model: "SV-900", serial: "A123", qty: 1, size: "900×800×1830 мм", powerKw: 0.5 }]
  s.placement!.landDocument = "акт на право частной собственности на земельный участок № 123"
  return s
}

// То, чего не может быть в договоре на автомат или киоск.
const FORBIDDEN = [
  "Помещени", // объект договора — Место, а не Помещение
  "потол",
  "Передаваемые ключи",
  "комплектов",
  "горяч",
  "отоплени",
  "перепланировк",
  "юридическ",
  "торговой / офисной",
  "эксплуатационн",
]

describe("договор на размещение", () => {
  for (const type of ["EQUIPMENT", "TERRITORY"] as const) {
    it(`${type}: в тексте и приложениях нет пунктов про помещение`, () => {
      const text = renderContractText(placed(type))
      for (const w of FORBIDDEN) expect(text, `нашлось «${w}»`).not.toContain(w)
    })

    it(`${type}: предмет, перечень оборудования и схема на месте`, () => {
      const text = renderContractText(placed(type))
      expect(text).toContain("(далее — «Место»)")
      expect(text).toContain("SV-900 | A123")
      expect(text).toContain("Приложение № 1 — Акт приёма-передачи")
      expect(text).toContain("Приложение № 2 — Схема размещения")
      expect(text).toContain("[Схема размещения]")
    })

    it(`${type}: нумерация разделов сквозная, ссылки ведут на реальные разделы`, () => {
      const s = placed(type)
      s.modules.insuranceEnabled = false
      s.modules.confidentialityEnabled = false
      const a = assemble(s)
      expect(a.sections.map((x) => x.num)).toEqual(a.sections.map((_, i) => i + 1))
      const text = renderContractText(s)
      const byTitle = new Map(a.sections.map((x) => [x.title, x.num]))
      expect(text).toContain(`по основаниям раздела ${byTitle.get("Изменение и расторжение Договора")}`)
      expect(text).toContain(`на банковский счёт Арендодателя (раздел ${a.requisitesNum})`)
    })

    it(`${type}: без депозита — ни одного упоминания Депозита`, () => {
      const s = placed(type)
      s.financials.deposit.enabled = false
      expect(renderContractText(s)).not.toContain("Депозит")
    })
  }

  it("территория: временное сооружение, запрет капитального строительства, документ на землю", () => {
    const text = renderContractText(placed("TERRITORY"))
    expect(text).toContain("временного (некапитального) сооружения")
    expect(text).toContain("объектов капитального строительства")
    expect(text).toContain("(правоустанавливающий документ: акт на право частной собственности на земельный участок № 123; кадастровый номер: ________________)")
    expect(text).toContain("аренды части земельного участка для размещения временного сооружения")
  })

  it("оборудование: без подключения к сети — нет строк про счётчик и мощность", () => {
    const s = placed("EQUIPMENT")
    s.placement!.electricity = "none"
    const text = renderContractText(s)
    expect(text).toContain("без подключения к электрическим сетям")
    expect(text).not.toContain("прибора учёта")
  })

  it("фиксированная плата за свет без суммы — ошибка, договор не сформировать", () => {
    const s = placed("EQUIPMENT")
    s.placement!.electricity = "fixed"
    expect(assemble(s).validation.hard.join()).toContain("фиксированной платой")
  })
})

describe("пресет типа договора", () => {
  it("подменяет автоматическую цель использования, но не введённую руками", () => {
    const s = defaultState()
    applyContractTypePreset(s, "EQUIPMENT")
    expect(s.premises.purposeUse).toBe("размещения и эксплуатации оборудования Арендатора")
    const own = defaultState()
    own.premises.purposeUse = "продажи кофе"
    applyContractTypePreset(own, "EQUIPMENT")
    expect(own.premises.purposeUse).toBe("продажи кофе")
  })

  it("возврат к помещению убирает условия размещения и цель", () => {
    const s = defaultState()
    applyContractTypePreset(s, "TERRITORY")
    applyContractTypePreset(s, "PREMISES")
    expect(s.placement).toBeUndefined()
    expect(s.premises.purposeUse).toBe(defaultState().premises.purposeUse)
  })

  it("переключение оборудование → территория сохраняет площадь и перечень", () => {
    const s = defaultState()
    applyContractTypePreset(s, "EQUIPMENT")
    s.placement!.placeAreaSqm = 4
    s.placement!.equipment = [{ name: "Киоск", model: "", serial: "", qty: 1, size: "", powerKw: 0 }]
    applyContractTypePreset(s, "TERRITORY")
    expect(s.placement!.family).toBe("territory")
    expect(s.placement!.placeAreaSqm).toBe(4)
    expect(s.placement!.equipment).toHaveLength(1)
  })
})

describe("автоопределение типа договора", () => {
  const floor = (kind: string) => ({ kind })
  it("место-объект на обычном этаже — размещение оборудования", () => {
    expect(resolveContractTypeForTenant({ space: { kind: "OBJECT", floor: floor("FLOOR") } })).toBe("EQUIPMENT")
  })
  it("кабинет — помещение, территория — территория, крыша — крыша", () => {
    expect(resolveContractTypeForTenant({ space: { kind: "RENTABLE", floor: floor("FLOOR") } })).toBe("PREMISES")
    expect(resolveContractTypeForTenant({ space: { kind: "OBJECT", floor: floor("TERRITORY") } })).toBe("TERRITORY")
    expect(resolveContractTypeForTenant({ space: { kind: "OBJECT", floor: floor("ROOF") } })).toBe("ROOF")
  })
  it("без помещения — размещение оборудования", () => {
    expect(resolveContractTypeForTenant({})).toBe("EQUIPMENT")
  })
})

describe("DOCX договора на размещение", () => {
  for (const type of ["EQUIPMENT", "TERRITORY"] as const) {
    it(`${type}: документ собирается, приложения внутри`, async () => {
      const { renderContractDocx } = await import("./docx")
      const buf = await renderContractDocx(placed(type))
      expect(buf.length).toBeGreaterThan(5000)
      const { default: JSZip } = await import("jszip")
      const xml = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string")
      expect(xml).toContain("СХЕМА")
      expect(xml).toContain("SV-900")
      expect(xml).not.toContain("Передаваемые ключи")
    })
  }
})
