/**
 * Расхождения между подписанным договором и карточкой арендатора.
 *
 * Зачем: договор — источник правды по условиям сделки, но начисления считаются
 * по карточке. Условия переносятся в карточку в момент подписания, поэтому
 * договоры, подписанные до появления этого переноса, остались неперенесёнными,
 * а поля, которые перенос не покрывает (день оплаты, пеня), расходятся молча.
 * Молча — и есть проблема: расхождение всплывает счётом у арендатора.
 *
 * ГЛАВНОЕ ПРАВИЛО: сверять по ТИПУ договора. У договора на помещение
 * эксплуатационные расходы живут в `financials.operatingCosts`, а у договора на
 * размещение (оборудование/территория) — в `placement.serviceFeePerSqm`, и
 * пустой `operatingCosts` там нормален. Сверка «в лоб», без учёта типа, даёт
 * ложную тревогу: именно так договор на киоск выглядел как переплата, хотя
 * ставка была прямо записана в его условиях.
 *
 * Модуль чистый (без БД) — его же логику проверяет lib/contract-vs-card.test.ts.
 */

export type DivergenceField =
  | "termStart"
  | "termEnd"
  | "rent"
  | "dueDay"
  | "penalty"
  | "deposit"
  | "cleaning"
  | "operatingCosts"

export type DivergenceKind = "money" | "date" | "percent" | "day" | "flag"

export interface ContractDivergence {
  field: DivergenceField
  kind: DivergenceKind
  /** Что записано в договоре. null — условия нет. */
  contract: number | string | null
  /** Что стоит в карточке и по чему реально считает биллинг. */
  card: number | string | null
}

/** Поля карточки, по которым считается биллинг. */
export interface CardTerms {
  contractStart: Date | string | null
  contractEnd: Date | string | null
  fixedMonthlyRent: number | null
  paymentDueDay: number | null
  penaltyPercent: number | null
  depositAmount: number | null
  cleaningFee: number | null
  needsCleaning: boolean | null
  serviceFeeExempt: boolean | null
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function num(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value
  return typeof n === "number" && Number.isFinite(n) ? n : null
}

function day(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** Договор на размещение (оборудование/территория) — у него свои условия по расходам. */
export function isPlacementFamily(builderState: unknown): boolean {
  const family = record(record(builderState)?.placement)?.family
  return family === "equipment" || family === "territory"
}

/**
 * Сверка условий. Возвращает только расхождения; пустой массив — всё сходится.
 *
 * Сравниваем лишь то, по чему считаются деньги. Индексация сюда не входит
 * намеренно: в договоре это ПОТОЛОК («не более 10 % в год»), а в карточке —
 * фактический процент. Разные величины, сравнивать их нельзя.
 */
export function contractVsCard(builderState: unknown, card: CardTerms): ContractDivergence[] {
  const state = record(builderState)
  if (!state) return []
  const financials = record(state.financials)
  if (!financials) return []

  const out: ContractDivergence[] = []
  const push = (field: DivergenceField, kind: DivergenceKind, contract: number | string | null, cardValue: number | string | null) => {
    out.push({ field, kind, contract, card: cardValue })
  }

  const term = record(state.term)
  const startContract = typeof term?.startDate === "string" ? term.startDate : null
  const endContract = typeof term?.endDate === "string" ? term.endDate : null
  if (startContract && startContract !== day(card.contractStart)) {
    push("termStart", "date", startContract, day(card.contractStart))
  }
  if (endContract && endContract !== day(card.contractEnd)) {
    push("termEnd", "date", endContract, day(card.contractEnd))
  }

  // Аренда: договорная сумма должна лежать в карточке, иначе биллинг посчитает
  // по ставке этажа. Совпадение ставки этажа с договором сегодня — совпадение,
  // а не гарантия: поменяют ставку этажа, и суммы разойдутся с документом.
  const rent = num(financials.monthlyRent)
  if (rent !== null && rent > 0 && (card.fixedMonthlyRent ?? 0) !== rent) {
    push("rent", "money", rent, card.fixedMonthlyRent)
  }

  const dueDay = num(financials.paymentDueDay)
  if (dueDay !== null && (card.paymentDueDay ?? 0) !== dueDay) {
    push("dueDay", "day", dueDay, card.paymentDueDay)
  }

  const penalty = num(record(financials.penalty)?.tenantPerDay)
  if (penalty !== null && (card.penaltyPercent ?? 0) !== penalty) {
    push("penalty", "percent", penalty, card.penaltyPercent)
  }

  // Депозит: «выключен» в договоре — это условие, а не отсутствие условия.
  const deposit = record(financials.deposit)
  const depositEnabled = deposit?.enabled
  const depositAmount = num(deposit?.amount)
  if (depositEnabled === false) {
    if ((card.depositAmount ?? 0) !== 0) push("deposit", "money", 0, card.depositAmount)
  } else if (depositAmount !== null && depositAmount > 0 && (card.depositAmount ?? 0) !== depositAmount) {
    push("deposit", "money", depositAmount, card.depositAmount)
  }

  const cleaning = record(record(financials.additionalServices)?.premisesCleaning)
  const cleaningOrdered = cleaning?.ordered
  const cleaningMonthly = num(cleaning?.monthly)
  if (cleaningOrdered === true && cleaningMonthly !== null && cleaningMonthly > 0) {
    if ((card.cleaningFee ?? 0) !== cleaningMonthly || card.needsCleaning !== true) {
      push("cleaning", "money", cleaningMonthly, card.needsCleaning ? card.cleaningFee : null)
    }
  } else if (cleaningOrdered === false && (card.needsCleaning === true || (card.cleaningFee ?? 0) > 0)) {
    push("cleaning", "money", 0, card.cleaningFee)
  }

  // Эксплуатационные расходы — ТОЛЬКО для договора на помещение. У договора на
  // размещение ставка живёт в placement.serviceFeePerSqm, и пустой
  // operatingCosts там штатный.
  if (!isPlacementFamily(builderState)) {
    const method = record(financials.operatingCosts)?.method
    if (method === "none" && card.serviceFeeExempt !== true) {
      push("operatingCosts", "flag", "не начисляются", "начисляются по ставке здания")
    }
  }

  return out
}
