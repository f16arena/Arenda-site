// deriveContext(state) — вычисляет производный контекст из состояния
// (спецификация §5: operatingCosts.enabled, annexes.*, списки ресурсов,
// тексты-сводки utilities_clause/signage_clause, покрытие эксплуат. расходов).

import {
  type ContractState,
  type UtilityKey,
  UTILITY_LABELS,
  UTILITY_ORDER,
} from "./schema"

export interface UtilityRef {
  key: UtilityKey
  label: string
}

export interface DerivedAnnexes {
  act: boolean // Прил.№1
  services: boolean // Прил.№2 (derived)
  operatingCosts: boolean // Прил.№3 (derived)
}

export interface DerivedContext {
  opEnabled: boolean
  anyService: boolean
  included: UtilityRef[]
  metered: UtilityRef[]
  inOperating: UtilityRef[]
  annexes: DerivedAnnexes
  utilitiesClause: string // п.1.5
  signageClause: string // п.1.6
  /** статьи, покрываемые эксплуатационными расходами (Прил.№3) */
  covers: string[]
}

function listLabels(refs: UtilityRef[]): string {
  return refs.map((r) => r.label.toLowerCase()).join(", ")
}

export function deriveContext(s: ContractState): DerivedContext {
  const f = s.financials
  const opEnabled = f.operatingCosts.method !== "none"

  const sv = f.additionalServices
  const anyService =
    sv.premisesCleaning.ordered ||
    sv.internet.ordered ||
    sv.phone.ordered ||
    sv.premisesSecurity.ordered ||
    sv.other.ordered

  const byMode = (mode: string): UtilityRef[] =>
    UTILITY_ORDER.filter((k) => f.premisesUtilities[k] === mode).map((k) => ({
      key: k,
      label: UTILITY_LABELS[k],
    }))

  const included = byMode("included")
  const metered = byMode("metered_separate")
  const inOperating = byMode("in_operating_costs")

  const annexes: DerivedAnnexes = {
    act: s.modules.actEnabled,
    services: anyService,
    operatingCosts: opEnabled,
  }

  // п.1.5 — сводка порядка оплаты коммунальных услуг
  const parts: string[] = []
  if (included.length) parts.push(`коммунальные услуги (${listLabels(included)}) включены в арендную плату`)
  if (metered.length) parts.push(`${listLabels(metered)} оплачиваются Арендатором отдельно по приборам учёта`)
  if (inOperating.length) parts.push(`${listLabels(inOperating)} учитываются в составе эксплуатационных расходов`)
  const utilitiesClause = parts.length
    ? parts.join("; ").replace(/^./, (c) => c.toUpperCase()) + "."
    : "Порядок оплаты коммунальных услуг определён в разделе 3 Договора."

  // п.1.6 — вывески
  const signageClause = s.modules.signageEnabled
    ? "Арендатор вправе с письменного согласия Арендодателя размещать на здании вывески, указательные таблички и рекламные конструкции по согласованному образцу и в согласованном месте."
    : "Размещение Арендатором вывесок, рекламных и иных конструкций на здании не предусмотрено."

  // покрытие эксплуатационных расходов (Прил.№3)
  let covers = [
    "уборка и мытьё полов в местах общего пользования",
    "вывоз ТБО из мест общего пользования",
    "освещение, отопление и водоснабжение мест общего пользования",
    "охрана здания и видеонаблюдение в местах общего пользования",
    "содержание прилегающей территории",
    "текущий ремонт мест общего пользования",
  ]
  if (f.operatingCosts.scope === "all_inclusive") {
    covers = covers.concat(inOperating.map((r) => r.label.toLowerCase()))
  }

  return { opEnabled, anyService, included, metered, inOperating, annexes, utilitiesClause, signageClause, covers }
}
