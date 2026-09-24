// Валидация состояния перед сборкой (спецификация §8).
// hard — блокируют генерацию; soft — предупреждения (источник подсказок).
//
// Это ИНТЕРФЕЙС конструктора, а не текст договора: замечания читает
// администратор, пока заполняет форму. Модуль чистый и работает в браузере,
// поэтому серверный lib/i18n/server.ts сюда импортировать нельзя (серверный код
// уехал бы в клиентский бандл). Приём как в lib/kz-validators.ts: валидатор
// возвращает КЛЮЧ словаря (lib/i18n/messages/*/contractEngine.validation),
// человеческую подпись подставляет компонент через useT().

import { type ContractState, UTILITY_LABELS, validRentSteps } from "./schema"
import { type DerivedContext } from "./derive"
import { validatePlacement } from "./placement"

/** Ключ подписи в contractEngine.validation.*. */
export type ValidationKey =
  | "operatingMethodMissing"
  | "operatingRatesMissing"
  | "buildingAreaMissing"
  | "advanceRateMissing"
  | "doubleCharge"
  | "termOrder"
  | "dueDayRange"
  | "rentStepsInvalid"
  | "rentStepsDuplicate"
  | "rentStepsLateStart"
  | "rentStepsSingle"
  | "debtAmountMissing"
  | "debtDiscountRange"
  | "debtMonthsRange"
  | "debtBasisMissing"
  | "rentMissing"
  | "depositMissing"
  | "penaltyAsymmetry"
  // договор на размещение (placement.ts)
  | "placeAreaMissing"
  | "placeDescriptionMissing"
  | "equipmentListEmpty"
  | "objectListEmpty"
  | "electricityFixedMissing"
  | "landDocumentMissing"

export interface ValidationIssue {
  key: ValidationKey
  /** Подстановки в подпись ({resources} и т.п.). */
  vars?: Record<string, string | number>
}

export interface ValidationResult {
  hard: ValidationIssue[]
  soft: ValidationIssue[]
}

export function validate(s: ContractState, c: DerivedContext): ValidationResult {
  const hard: ValidationIssue[] = []
  const soft: ValidationIssue[] = []
  const f = s.financials
  const op = f.operatingCosts

  // 8.1 ресурс in_operating_costs ⇒ метод ≠ none
  if (c.inOperating.length && op.method === "none") {
    hard.push({ key: "operatingMethodMissing" })
  }
  // 8.2 fixed_per_sqm ⇒ заданы ставки
  if (op.method === "fixed_per_sqm" && (!op.fixed?.winterRate || !op.fixed?.summerRate)) {
    hard.push({ key: "operatingRatesMissing" })
  }
  // 8.3 pooled_prorata ⇒ общая площадь, параметры перерасчёта
  if (op.method === "pooled_prorata") {
    if (!s.building.totalRentableAreaSqm) {
      hard.push({ key: "buildingAreaMissing" })
    }
    if (op.pooled?.basis === "estimated_with_reconciliation" && !op.pooled?.estimatedRatePerSqm) {
      hard.push({ key: "advanceRateMissing" })
    }
  }
  // 8.4 scope=all_inclusive ⇒ нет двойного начисления: при «всё включено»
  // эксплуатационные расходы уже покрывают коммуналку Помещения, поэтому любой
  // ресурс по индивидуальному счётчику = двойное начисление (исправл. 3.2).
  if (op.method !== "none" && op.scope === "all_inclusive" && c.metered.length) {
    // Названия ресурсов — из UTILITY_LABELS: теми же словами они перечислены в
    // пунктах договора, поэтому остаются русскими (docs/i18n-documents-plan.md).
    hard.push({
      key: "doubleCharge",
      vars: { resources: c.metered.map((r) => UTILITY_LABELS[r.key]).join(", ") },
    })
  }
  // 8.7 даты, день оплаты, депозит
  if (s.term.startDate && s.term.endDate && new Date(s.term.startDate) >= new Date(s.term.endDate)) {
    hard.push({ key: "termOrder" })
  }
  if (f.paymentDueDay < 1 || f.paymentDueDay > 28) {
    hard.push({ key: "dueDayRange" })
  }

  // 8.8 ступенчатая аренда: все введённые ступени валидны и месяцы не повторяются
  const rawSteps = f.rentSteps ?? []
  if (rawSteps.length > 0) {
    const valid = validRentSteps(rawSteps)
    if (valid.length < rawSteps.length) {
      hard.push({ key: "rentStepsInvalid" })
    }
    if (new Set(valid.map((st) => st.from)).size !== valid.length) {
      hard.push({ key: "rentStepsDuplicate" })
    }
    if (valid.length >= 2 && s.term.startDate && valid[0].from > s.term.startDate.slice(0, 7)) {
      soft.push({ key: "rentStepsLateStart" })
    }
    if (rawSteps.length === 1) {
      soft.push({ key: "rentStepsSingle" })
    }
  }

  // 8.9 входящий долг
  const debt = f.debtSettlement
  if (debt?.enabled) {
    if (!debt.totalAmount || debt.totalAmount <= 0) hard.push({ key: "debtAmountMissing" })
    if (debt.discountPercent < 0 || debt.discountPercent >= 100) hard.push({ key: "debtDiscountRange" })
    if (!Number.isInteger(debt.payWithinMonths) || debt.payWithinMonths < 1 || debt.payWithinMonths > 36) {
      hard.push({ key: "debtMonthsRange" })
    }
    if (!debt.basisDoc.trim()) soft.push({ key: "debtBasisMissing" })
  }

  // soft
  if (!f.monthlyRent) soft.push({ key: "rentMissing" })
  if (f.deposit.enabled !== false && !f.deposit.amount) soft.push({ key: "depositMissing" })
  if (
    f.penalty.tenantPerDay !== f.penalty.landlordPerDay ||
    f.penalty.tenantCapPercent !== f.penalty.landlordCapPercent
  ) {
    soft.push({ key: "penaltyAsymmetry" })
  }

  const pl = validatePlacement(s)
  hard.push(...pl.hard)
  soft.push(...pl.soft)

  return { hard, soft }
}
