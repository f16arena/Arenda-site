import { describe, it, expect } from "vitest"
import { placementServiceFeeForPeriod, placementElectricityTariff, isPlacementContract } from "@/lib/placement-billing"
import { defaultState, renderContractText } from "./index"
import { applyContractTypePreset } from "@/lib/contract-type-presets"

// Киоск 6 × 2,5 м на территории: эксплуатационные 270 ₸/м² круглый год,
// свет по счётчику по 48 ₸/кВт·ч (тариф здания для всех — 22).
function kiosk() {
  const s = defaultState()
  applyContractTypePreset(s, "TERRITORY")
  s.placement!.placeAreaSqm = 15
  s.placement!.serviceFeePerSqm = 270
  s.placement!.electricity = "meter"
  s.placement!.electricityTariff = 48
  return s
}

describe("начисления по договору на размещение", () => {
  it("эксплуатационные: 15 м² × 270 ₸ = 4 050 ₸ и зимой, и летом", () => {
    const s = kiosk()
    for (const period of ["2026-12", "2027-07"]) {
      expect(placementServiceFeeForPeriod(s, period, new Date(2026, 9, 1), new Date(2027, 7, 31))?.amount).toBe(4050)
    }
  })

  it("первый неполный месяц — по дням", () => {
    // договор с 16 октября: 16 дней из 31
    const fee = placementServiceFeeForPeriod(kiosk(), "2026-10", new Date(2026, 9, 16), null)
    expect(fee?.amount).toBe(Math.round(4050 * 16 / 31))
  })

  it("свет — тариф договора 48 ₸, а не тариф здания", () => {
    expect(placementElectricityTariff(kiosk())).toBe(48)
  })

  it("без ставки в договоре — считаем по-старому (по зданию)", () => {
    const s = kiosk()
    s.placement!.serviceFeePerSqm = 0
    expect(placementServiceFeeForPeriod(s, "2026-12", null, null)).toBeNull()
    expect(placementServiceFeeForPeriod(defaultState(), "2026-12", null, null)).toBeNull()
    expect(isPlacementContract(defaultState())).toBe(false)
  })

  it("договор называет ставку, сумму в месяц и тариф с пересчётом", () => {
    const text = renderContractText(kiosk()).replace(/\s/g, " ") // суммы пишутся с неразрывным пробелом
    expect(text).toContain("по единой для всех месяцев года ставке 270 ₸ за 1 кв. м площади Места в месяц и составляют 4 050 ₸")
    expect(text).toContain("по тарифу 48 ₸ (сорок восемь тенге) за 1 кВт·ч")
    expect(text).toContain("тариф изменяется пропорционально")
    expect(text).toContain("задолженность по арендной плате, эксплуатационным расходам и оплате электроэнергии")
  })
})
