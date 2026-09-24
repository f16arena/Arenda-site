// Помощник-советник (спецификация §8А). Правила — данные, не код в UI.
// Каждое правило при выполнении условия даёт подсказку; некоторые — с autoFix.
//
// Подсказки — ИНТЕРФЕЙС конструктора, их читает администратор. Модуль чистый и
// работает в браузере, поэтому текста здесь нет: правило возвращает КЛЮЧ
// словаря (contractEngine.advice.*), подпись подставляет компонент через
// useT() — тот же приём, что в validate.ts и lib/kz-validators.ts.

import { type ContractState } from "./schema"
import { type DerivedContext } from "./derive"

export type AdviceSeverity = "info" | "suggest" | "warn"
export type AdviceCategory = "fairness" | "completeness" | "risk" | "convenience"

/** Ключ подписи в contractEngine.advice.*. */
export type AdviceKey =
  | "penaltyAsymmetry"
  | "pooledFairness"
  | "meteredPrereq"
  | "includedRisk"
  | "operatingRatesEmpty"
  | "pooledAreaEmpty"
  | "depositNonstandard"
  | "indexation"
  | "insuranceOff"
  | "termEnding"

export interface Advice {
  id: string
  category: AdviceCategory
  severity: AdviceSeverity
  messageKey: AdviceKey
  /** Подстановки в подпись ({cap}, {days}). */
  vars?: Record<string, string | number>
  /** ключ автофикса (применяется на сервере через applyAdvisorFix) */
  fix?: string
}

export interface AdvisorRule {
  id: string
  category: AdviceCategory
  severity: AdviceSeverity
  when: (s: ContractState, c: DerivedContext) => boolean
  messageKey: AdviceKey
  /** Подстановки, если подпись их ждёт. */
  vars?: (s: ContractState, c: DerivedContext) => Record<string, string | number>
  fix?: string
}

/** Сколько дней осталось до конца срока (для напоминания о продлении). */
function daysToEnd(s: ContractState): number {
  return Math.ceil((new Date(s.term.endDate).getTime() - Date.now()) / 86_400_000)
}

export const ADVISOR_RULES: AdvisorRule[] = [
  {
    id: "PENALTY_ASYMMETRY",
    category: "fairness",
    severity: "suggest",
    when: (s) =>
      s.financials.penalty.tenantPerDay !== s.financials.penalty.landlordPerDay ||
      s.financials.penalty.tenantCapPercent !== s.financials.penalty.landlordCapPercent,
    messageKey: "penaltyAsymmetry",
    fix: "equalize_penalty",
  },
  {
    id: "MODEL_POOLED_FAIRNESS",
    category: "convenience",
    severity: "info",
    when: (s) => s.financials.operatingCosts.method === "pooled_prorata",
    messageKey: "pooledFairness",
  },
  {
    id: "MODEL_METERED_PREREQ",
    category: "risk",
    severity: "info",
    // в договоре на размещение коммунальной матрицы нет — только электроэнергия
    when: (s, c) => !s.placement && c.metered.length > 0,
    messageKey: "meteredPrereq",
  },
  {
    id: "MODEL_INCLUDED_RISK",
    category: "risk",
    severity: "suggest",
    when: (s, c) => !s.placement && c.included.filter((r) => r.key !== "garbage" && r.key !== "sewerage").length >= 3,
    messageKey: "includedRisk",
  },
  {
    id: "OPCOST_RATE_EMPTY",
    category: "completeness",
    severity: "warn",
    when: (s) =>
      s.financials.operatingCosts.method === "fixed_per_sqm" &&
      (!s.financials.operatingCosts.fixed?.winterRate || !s.financials.operatingCosts.fixed?.summerRate),
    messageKey: "operatingRatesEmpty",
  },
  {
    id: "POOL_AREA_EMPTY",
    category: "completeness",
    severity: "warn",
    when: (s) =>
      s.financials.operatingCosts.method === "pooled_prorata" && !s.building.totalRentableAreaSqm,
    messageKey: "pooledAreaEmpty",
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
    messageKey: "depositNonstandard",
    fix: "deposit_one_month",
  },
  {
    id: "INDEXATION_REMINDER",
    category: "convenience",
    severity: "info",
    when: (s) => s.financials.indexation.enabled,
    messageKey: "indexation",
    vars: (s) => ({ cap: s.financials.indexation.capPercent }),
  },
  {
    id: "INSURANCE_OFF",
    category: "risk",
    severity: "suggest",
    when: (s) => !s.modules.insuranceEnabled,
    messageKey: "insuranceOff",
  },
  {
    id: "TERM_REMINDER",
    category: "convenience",
    severity: "info",
    when: (s) => {
      if (!s.term.endDate) return false
      const days = daysToEnd(s)
      return days > 0 && days < 60
    },
    messageKey: "termEnding",
    vars: (s) => ({ days: daysToEnd(s) }),
  },
]

export function advise(s: ContractState, c: DerivedContext): Advice[] {
  return ADVISOR_RULES.filter((r) => r.when(s, c)).map((r) => ({
    id: r.id,
    category: r.category,
    severity: r.severity,
    messageKey: r.messageKey,
    vars: r.vars?.(s, c),
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
