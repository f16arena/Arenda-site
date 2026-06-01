// Помощник-советник (спецификация §8А). Правила — данные, не код в UI.
// Каждое правило при выполнении условия даёт подсказку; некоторые — с autoFix.

import { type ContractState } from "./schema"
import { type DerivedContext } from "./derive"

export type AdviceSeverity = "info" | "suggest" | "warn"
export type AdviceCategory = "fairness" | "completeness" | "risk" | "convenience"

export interface Advice {
  id: string
  category: AdviceCategory
  severity: AdviceSeverity
  message: string
  /** ключ автофикса (применяется на сервере через applyAdvisorFix) */
  fix?: string
}

export interface AdvisorRule {
  id: string
  category: AdviceCategory
  severity: AdviceSeverity
  when: (s: ContractState, c: DerivedContext) => boolean
  message: (s: ContractState, c: DerivedContext) => string
  fix?: string
}

export const ADVISOR_RULES: AdvisorRule[] = [
  {
    id: "PENALTY_ASYMMETRY",
    category: "fairness",
    severity: "suggest",
    when: (s) =>
      s.financials.penalty.tenantPerDay !== s.financials.penalty.landlordPerDay ||
      s.financials.penalty.tenantCapPercent !== s.financials.penalty.landlordCapPercent,
    message: () =>
      "Пеня Арендатора и Арендодателя различается. Обычно её делают одинаковой — это честно и не вызывает споров.",
    fix: "equalize_penalty",
  },
  {
    id: "MODEL_POOLED_FAIRNESS",
    category: "convenience",
    severity: "info",
    when: (s) => s.financials.operatingCosts.method === "pooled_prorata",
    message: () =>
      "Котловой долевой расчёт удобен вам — не нужны индивидуальные счётчики. Но арендаторы платят «вскладчину»; для прозрачности рекомендуется перерасчёт по факту раз в квартал.",
  },
  {
    id: "MODEL_METERED_PREREQ",
    category: "risk",
    severity: "info",
    when: (_s, c) => c.metered.length > 0,
    message: () =>
      "Раздельный учёт требует исправных индивидуальных счётчиков; при их отсутствии расчёт пойдёт пропорционально площади.",
  },
  {
    id: "MODEL_INCLUDED_RISK",
    category: "risk",
    severity: "suggest",
    when: (_s, c) => c.included.filter((r) => r.key !== "garbage" && r.key !== "sewerage").length >= 3,
    message: () =>
      "Много коммунальных услуг включено в аренду — риск роста тарифов несёт владелец. Рассмотрите счётчики или эксплуатационные расходы.",
  },
  {
    id: "OPCOST_RATE_EMPTY",
    category: "completeness",
    severity: "warn",
    when: (s) =>
      s.financials.operatingCosts.method === "fixed_per_sqm" &&
      (!s.financials.operatingCosts.fixed?.winterRate || !s.financials.operatingCosts.fixed?.summerRate),
    message: () => "Не заданы тарифы эксплуатационных расходов (зима/лето).",
  },
  {
    id: "POOL_AREA_EMPTY",
    category: "completeness",
    severity: "warn",
    when: (s) =>
      s.financials.operatingCosts.method === "pooled_prorata" && !s.building.totalRentableAreaSqm,
    message: () => "Не указана общая арендуемая площадь здания — это знаменатель долевого расчёта.",
  },
  {
    id: "DEPOSIT_NONSTANDARD",
    category: "fairness",
    severity: "info",
    when: (s) =>
      s.financials.deposit.enabled !== false &&
      !!s.financials.monthlyRent &&
      !!s.financials.deposit.amount &&
      s.financials.deposit.amount !== s.financials.monthlyRent,
    message: () => "Депозит ≠ одной месячной плате. Стандартная практика — депозит в размере одной месячной аренды.",
    fix: "deposit_one_month",
  },
  {
    id: "INDEXATION_REMINDER",
    category: "convenience",
    severity: "info",
    when: (s) => s.financials.indexation.enabled,
    message: (s) =>
      `Индексация — только через ДС. Автоиндексации в договоре нет; платформа напомнит и предзаполнит ДС уровнем инфляции (до ${s.financials.indexation.capPercent}%).`,
  },
  {
    id: "INSURANCE_OFF",
    category: "risk",
    severity: "suggest",
    when: (s) => !s.modules.insuranceEnabled,
    message: () =>
      "Страхование выключено. Без страхования ответственности риски при инциденте стороны несут напрямую.",
  },
  {
    id: "TERM_REMINDER",
    category: "convenience",
    severity: "info",
    when: (s) => {
      if (!s.term.endDate) return false
      const days = Math.ceil((new Date(s.term.endDate).getTime() - Date.now()) / 86_400_000)
      return days > 0 && days < 60
    },
    message: (s) => {
      const days = Math.ceil((new Date(s.term.endDate).getTime() - Date.now()) / 86_400_000)
      return `Срок подходит к концу (${days} дн.). Автопролонгации нет — оформите ДС о продлении.`
    },
  },
]

export function advise(s: ContractState, c: DerivedContext): Advice[] {
  return ADVISOR_RULES.filter((r) => r.when(s, c)).map((r) => ({
    id: r.id,
    category: r.category,
    severity: r.severity,
    message: r.message(s, c),
    fix: r.fix,
  }))
}

/** Применение autoFix к состоянию (чистая функция; вызывается через PUT). */
export function applyAdvisorFix(s: ContractState, fix: string): ContractState {
  const next = structuredClone(s)
  const f = next.financials
  switch (fix) {
    case "equalize_penalty":
      f.penalty.landlordPerDay = f.penalty.tenantPerDay
      f.penalty.landlordCapPercent = f.penalty.tenantCapPercent
      break
    case "deposit_one_month":
      f.deposit.amount = f.monthlyRent
      break
  }
  return next
}
