import { describe, it, expect } from "vitest"
import { defaultState } from "./schema"
import { applyContractDefaults, extractContractDefaults } from "./org-defaults"

describe("условия договора по умолчанию для организации", () => {
  it("запомненное подставляется в новый договор", () => {
    const src = defaultState()
    src.meta.city = "г. Алматы"
    src.financials.paymentDueDay = 10
    src.financials.penalty.tenantPerDay = 0.3
    src.financials.deposit.enabled = false
    src.modules.insuranceEnabled = false
    src.financials.premisesUtilities.water = "included" as never
    const saved = JSON.parse(JSON.stringify(extractContractDefaults(src)))

    const fresh = defaultState()
    applyContractDefaults(fresh, saved)
    expect(fresh.meta.city).toBe("г. Алматы")
    expect(fresh.financials.paymentDueDay).toBe(10)
    expect(fresh.financials.penalty.tenantPerDay).toBe(0.3)
    expect(fresh.financials.deposit.enabled).toBe(false)
    expect(fresh.modules.insuranceEnabled).toBe(false)
  })

  it("суммы, даты и стороны не запоминаются", () => {
    const src = defaultState()
    src.financials.monthlyRent = 500000
    src.term.startDate = "2026-10-01"
    src.tenant.name = "ТОО Ромашка"
    const d = extractContractDefaults(src) as Record<string, unknown>
    expect(JSON.stringify(d)).not.toContain("500000")
    expect(JSON.stringify(d)).not.toContain("2026-10-01")
    expect(JSON.stringify(d)).not.toContain("Ромашка")
  })

  it("битые данные из базы пропускаются, договор не ломается", () => {
    const s = defaultState()
    const before = JSON.stringify(s)
    applyContractDefaults(s, { paymentDueDay: 99, penalty: { tenantPerDay: "много" }, premisesUtilities: { heating: "бесплатно" }, city: 42 })
    applyContractDefaults(s, "мусор")
    applyContractDefaults(s, null)
    expect(JSON.stringify(s)).toBe(before)
  })
})
