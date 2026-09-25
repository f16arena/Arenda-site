import { describe, expect, it } from "vitest"
import {
  buildingWithContractRates,
  calculateServiceFeeForPeriod,
  contractServiceFeeTerms,
  type BuildingForServiceFee,
} from "@/lib/service-fee"

/**
 * Регрессия по живому случаю: договор № 024 (ИП, помещение 78,2 м²) выпущен с
 * условием «коммунальные включены в аренду, эксплуатационные расходы не
 * начисляются», а в счёт всё равно встала строка «Эксплуатационные расходы
 * 7 038 ₸» — биллинг смотрел только на ставку здания и флаг в карточке
 * арендатора, а условия договора не читал вовсе.
 *
 * Это деньги и расхождение с подписанным документом, поэтому правило
 * закреплено тестом: договор первичен.
 */

const BUILDING: BuildingForServiceFee = {
  id: "building_main",
  serviceFeeWinterRate: 608,
  serviceFeeSummerRate: 270,
  serviceFeeWinterMonths: "[1,2,3,4,10,11,12]",
  serviceFeeIndexationPct: 12,
}

const TENANT = {
  id: "t1",
  contractStart: new Date("2026-09-21T00:00:00Z"),
  contractEnd: new Date("2027-09-21T00:00:00Z"),
  space: { area: 78.2, floor: { buildingId: "building_main" } },
  tenantSpaces: [],
  fullFloors: [],
}

function stateWith(operatingCosts: unknown) {
  return { financials: { operatingCosts } }
}

describe("эксплуатационные расходы по условиям договора", () => {
  it("«не начисляются» — ставка здания не применяется", () => {
    const terms = contractServiceFeeTerms(stateWith({ method: "none", scope: "all_inclusive" }))
    expect(terms.kind).toBe("none")
  })

  it("договор молчит — остаётся ставка здания", () => {
    expect(contractServiceFeeTerms(null).kind).toBe("building")
    expect(contractServiceFeeTerms({}).kind).toBe("building")
    expect(contractServiceFeeTerms(stateWith({})).kind).toBe("building")
  })

  it("своя ставка в договоре заменяет ставку здания", () => {
    const terms = contractServiceFeeTerms(
      stateWith({ method: "fixed_per_sqm", fixed: { winterRate: 500, summerRate: 200 } }),
    )
    expect(terms).toEqual({ kind: "fixed", winterRate: 500, summerRate: 200 })

    const source = buildingWithContractRates(BUILDING, terms)
    expect(source.serviceFeeSummerRate).toBe(200)
    expect(source.serviceFeeWinterRate).toBe(500)
    // Индексацию ставки здания к договорной цифре не применяем: она меняется
    // только допсоглашением.
    expect(source.serviceFeeIndexationPct).toBeNull()
  })

  it("нулевые ставки в договоре не считаются условием — берём здание", () => {
    const terms = contractServiceFeeTerms(
      stateWith({ method: "fixed_per_sqm", fixed: { winterRate: 0, summerRate: 0 } }),
    )
    expect(terms.kind).toBe("building")
  })

  it("pooled_prorata считается отдельно — поведение не меняем", () => {
    expect(contractServiceFeeTerms(stateWith({ method: "pooled_prorata" })).kind).toBe("building")
  })

  it("ставка здания даёт ту самую сумму из счёта — 7 038 ₸ за 10 дней сентября", () => {
    const fee = calculateServiceFeeForPeriod(TENANT, BUILDING, "2026-09", 10)
    expect(fee.shouldCreate).toBe(true)
    expect(fee.isProrated).toBe(true)
    expect(fee.amount).toBe(7038)
  })

  it("по договорной ставке сумма считается от неё, а не от здания", () => {
    const terms = contractServiceFeeTerms(
      stateWith({ method: "fixed_per_sqm", fixed: { winterRate: 500, summerRate: 100 } }),
    )
    const fee = calculateServiceFeeForPeriod(TENANT, buildingWithContractRates(BUILDING, terms), "2026-09", 10)
    // 78,2 м² × 100 ₸ × 10/30 дней
    expect(fee.amount).toBe(2607)
  })
})
