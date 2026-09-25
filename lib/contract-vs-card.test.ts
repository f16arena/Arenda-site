import { describe, expect, it } from "vitest"
import { contractVsCard, isPlacementFamily, type CardTerms } from "@/lib/contract-vs-card"

const CARD: CardTerms = {
  contractStart: new Date("2026-09-21T00:00:00Z"),
  contractEnd: new Date("2027-09-21T00:00:00Z"),
  fixedMonthlyRent: 200000,
  paymentDueDay: 10,
  penaltyPercent: 0.5,
  depositAmount: 100000,
  cleaningFee: 0,
  needsCleaning: false,
  serviceFeeExempt: false,
}

function premises(financials: Record<string, unknown> = {}) {
  return {
    term: { startDate: "2026-09-21", endDate: "2027-09-21" },
    financials: {
      monthlyRent: 200000,
      paymentDueDay: 10,
      penalty: { tenantPerDay: 0.5 },
      deposit: { enabled: true, amount: 100000 },
      operatingCosts: { method: "fixed_per_sqm", fixed: { winterRate: 608, summerRate: 270 } },
      ...financials,
    },
  }
}

describe("сверка договора с карточкой", () => {
  it("совпадающие условия расхождений не дают", () => {
    expect(contractVsCard(premises(), CARD)).toEqual([])
  })

  it("договорная аренда не попала в карточку", () => {
    const d = contractVsCard(premises(), { ...CARD, fixedMonthlyRent: null })
    expect(d).toEqual([{ field: "rent", kind: "money", contract: 200000, card: null }])
  })

  it("депозит из договора не заведён", () => {
    const d = contractVsCard(premises(), { ...CARD, depositAmount: null })
    expect(d).toEqual([{ field: "deposit", kind: "money", contract: 100000, card: null }])
  })

  it("депозит выключен договором, а в карточке сумма", () => {
    const d = contractVsCard(premises({ deposit: { enabled: false, amount: 600000 } }), { ...CARD, depositAmount: 600000 })
    expect(d).toEqual([{ field: "deposit", kind: "money", contract: 0, card: 600000 }])
  })

  it("день оплаты и пеня расходятся", () => {
    const d = contractVsCard(premises(), { ...CARD, paymentDueDay: 5, penaltyPercent: 1 })
    expect(d.map((x) => x.field).sort()).toEqual(["dueDay", "penalty"])
  })

  it("срок аренды в карточке другой", () => {
    const d = contractVsCard(premises(), { ...CARD, contractEnd: new Date("2027-01-01T00:00:00Z") })
    expect(d).toEqual([{ field: "termEnd", kind: "date", contract: "2027-09-21", card: "2027-01-01" }])
  })

  it("«расходы не начисляются», а арендатор не освобождён", () => {
    const d = contractVsCard(premises({ operatingCosts: { method: "none" } }), CARD)
    expect(d).toEqual([
      { field: "operatingCosts", kind: "flag", contract: "не начисляются", card: "начисляются по ставке здания" },
    ])
  })

  it("освобождение проставлено — расхождения нет", () => {
    const d = contractVsCard(premises({ operatingCosts: { method: "none" } }), { ...CARD, serviceFeeExempt: true })
    expect(d).toEqual([])
  })

  /**
   * Регрессия на мою собственную ошибку: у договора на место (киоск на
   * территории) расходы записаны в placement.serviceFeePerSqm, а
   * operatingCosts.method там штатно "none". Сверка «в лоб» объявляла такой
   * договор переплатой, хотя ставка 270 ₸/м² прямо в его условиях.
   */
  it("договор на размещение: пустой operatingCosts — не расхождение", () => {
    const state = {
      ...premises({ operatingCosts: { method: "none" } }),
      placement: { family: "territory", placeAreaSqm: 15, serviceFeePerSqm: 270 },
    }
    expect(isPlacementFamily(state)).toBe(true)
    expect(contractVsCard(state, CARD)).toEqual([])
  })

  it("уборка заказана договором, но в карточке выключена", () => {
    const state = premises({ additionalServices: { premisesCleaning: { ordered: true, monthly: 35000 } } })
    const d = contractVsCard(state, CARD)
    expect(d).toEqual([{ field: "cleaning", kind: "money", contract: 35000, card: null }])
  })

  it("договор без конструктора сверять нечем", () => {
    expect(contractVsCard(null, CARD)).toEqual([])
    expect(contractVsCard({}, CARD)).toEqual([])
  })
})
