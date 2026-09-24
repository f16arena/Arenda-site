// Условия договора по умолчанию для организации («запомнить для новых
// договоров»): чтобы не вбивать город, пеню, депозит и модули заново в каждом
// договоре. Хранятся в Organization.contractDefaults (JSON). Порядок при
// создании договора: пустой договор → условия организации → условия из
// карточки арендатора (они конкретнее и важнее).
//
// ЯЗЫК: значения по умолчанию (город, основание полномочий) попадают прямо в
// договор, поэтому остаются русскими (docs/i18n-documents-plan.md).

import type { ContractState, Modules, Penalty, Indexation, UtilityKey, UtilityMode } from "./schema"
import { UTILITY_ORDER } from "./schema"

export interface ContractDefaults {
  city?: string
  paymentDueDay?: number
  vatIncluded?: boolean
  penalty?: Penalty
  indexation?: Indexation
  deposit?: { enabled: boolean; installmentAllowed: boolean }
  premisesUtilities?: Partial<Record<UtilityKey, UtilityMode>>
  modules?: Partial<Modules>
}

const UTILITY_MODES: UtilityMode[] = ["included", "metered_separate", "in_operating_costs"]
const MODULE_KEYS: (keyof Modules)[] = ["insuranceEnabled", "signageEnabled", "actEnabled", "confidentialityEnabled", "tenantExitOnUnusableEnabled"]

/** Что запоминаем из текущего договора. Суммы, даты и стороны — нет: они у каждого свои. */
export function extractContractDefaults(s: ContractState): ContractDefaults {
  const f = s.financials
  const modules: Partial<Modules> = {}
  for (const k of MODULE_KEYS) if (typeof s.modules[k] === "boolean") (modules as Record<string, boolean>)[k] = s.modules[k] as boolean
  return {
    city: s.meta.city,
    paymentDueDay: f.paymentDueDay,
    vatIncluded: f.vatIncluded,
    penalty: { ...f.penalty },
    indexation: { ...f.indexation },
    deposit: { enabled: f.deposit.enabled !== false, installmentAllowed: !!f.deposit.installmentAllowed },
    premisesUtilities: { ...f.premisesUtilities },
    modules,
  }
}

const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null

/**
 * Подставить условия организации в договор (мутирует). Данные из базы не
 * доверенные — каждое поле проверяется, битое пропускается.
 */
export function applyContractDefaults(s: ContractState, raw: unknown): void {
  if (!raw || typeof raw !== "object") return
  const d = raw as Record<string, unknown>
  const f = s.financials
  if (typeof d.city === "string" && d.city.trim()) s.meta.city = d.city.trim().slice(0, 120)
  const day = num(d.paymentDueDay, 1, 28)
  if (day !== null) f.paymentDueDay = Math.round(day)
  if (typeof d.vatIncluded === "boolean") f.vatIncluded = d.vatIncluded
  const p = d.penalty as Record<string, unknown> | undefined
  if (p && typeof p === "object") {
    const tp = num(p.tenantPerDay, 0, 10), tc = num(p.tenantCapPercent, 0, 100)
    const lp = num(p.landlordPerDay, 0, 10), lc = num(p.landlordCapPercent, 0, 100)
    if (tp !== null) f.penalty.tenantPerDay = tp
    if (tc !== null) f.penalty.tenantCapPercent = tc
    if (lp !== null) f.penalty.landlordPerDay = lp
    if (lc !== null) f.penalty.landlordCapPercent = lc
  }
  const ix = d.indexation as Record<string, unknown> | undefined
  if (ix && typeof ix === "object") {
    if (typeof ix.enabled === "boolean") f.indexation.enabled = ix.enabled
    const cap = num(ix.capPercent, 0, 100)
    if (cap !== null) f.indexation.capPercent = cap
  }
  const dep = d.deposit as Record<string, unknown> | undefined
  if (dep && typeof dep === "object") {
    if (typeof dep.enabled === "boolean") f.deposit.enabled = dep.enabled
    if (typeof dep.installmentAllowed === "boolean") f.deposit.installmentAllowed = dep.installmentAllowed
  }
  const ut = d.premisesUtilities as Record<string, unknown> | undefined
  if (ut && typeof ut === "object") {
    for (const k of UTILITY_ORDER) {
      const v = ut[k]
      if (typeof v === "string" && (UTILITY_MODES as string[]).includes(v)) f.premisesUtilities[k] = v as UtilityMode
    }
  }
  const m = d.modules as Record<string, unknown> | undefined
  if (m && typeof m === "object") {
    for (const k of MODULE_KEYS) if (typeof m[k] === "boolean") (s.modules as unknown as Record<string, boolean>)[k] = m[k] as boolean
  }
}

/** Человеческий список того, что будет запомнено — для подсказки у кнопки. */
export const REMEMBERED_FIELDS = "город, день оплаты, НДС, пеня, индексация, депозит (вкл./рассрочка), коммунальные услуги, модули договора"
