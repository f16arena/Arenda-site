// Дополнительные соглашения (ДС) — спецификация §9–10. Чистый TS.
// Эффективное состояние = базовое + упорядоченные ДС, свёрнутые reducer-ом.
// Генерация текста ДС — через diff сборки «до/после» (операции restate/add/remove
// по снэпшоту нумерации действующей редакции).
//
// ВАЖНО: это ВНУТРЕННЯЯ модель конструктора. Привязка к реальным Contract/Tenant
// и подпись — отдельная интеграция (Фаза 5), здесь её нет.

import {
  type ContractState,
  type Party,
  type OperatingMethod,
  type OperatingScope,
  type OperatingCostsFixed,
  type OperatingCostsPooled,
} from "./schema"
import { assemble, type AssemblyResult } from "./assemble"
import { partyIntro } from "./parties"
import { dateLong } from "./numerals"

// ───────────────────────── типы ─────────────────────────

export type AmendmentType =
  | "rent_change"
  | "indexation"
  | "set_operating_costs"
  | "change_operating_costs"
  | "change_utilities"
  | "change_area"
  | "extend_term"
  | "change_requisites"
  | "assign_party"
  | "change_deposit"
  | "change_purpose"
  | "terminate"
  | "rent_holiday"

export const AMENDMENT_TYPES: AmendmentType[] = [
  "rent_change", "indexation", "set_operating_costs", "change_operating_costs",
  "change_utilities", "change_area", "extend_term", "change_requisites",
  "assign_party", "change_deposit", "change_purpose", "terminate", "rent_holiday",
]

export const AMENDMENT_LABELS: Record<AmendmentType, string> = {
  rent_change: "Изменение арендной платы",
  indexation: "Индексация платы",
  set_operating_costs: "Введение эксплуатационных расходов",
  change_operating_costs: "Изменение эксплуатационных расходов",
  change_utilities: "Изменение состава коммуналки/услуг",
  change_area: "Изменение площади/помещения",
  extend_term: "Продление срока",
  change_requisites: "Изменение реквизитов",
  assign_party: "Замена стороны",
  change_deposit: "Изменение депозита",
  change_purpose: "Изменение целевого назначения",
  terminate: "Расторжение",
  rent_holiday: "Каникулы/приостановка",
}

export interface Amendment {
  dsNumber: number
  dsDate: string
  effectiveDate: string
  type: AmendmentType
  payload: Record<string, unknown>
}

// ───────────────────────── жизненный цикл (§10) ─────────────────────────

export type ContractStatus = "draft" | "pending_signature" | "active" | "extended" | "terminating" | "terminated"

export const LIFECYCLE_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  draft: ["pending_signature"],
  pending_signature: ["active", "draft"],
  active: ["extended", "terminating"],
  extended: ["extended", "terminating"],
  terminating: ["terminated"],
  terminated: [],
}

export function canTransition(from: ContractStatus, to: ContractStatus): boolean {
  return LIFECYCLE_TRANSITIONS[from].includes(to)
}

// ───────────────────────── reducer (§9.1) ─────────────────────────

export function applyAmendment(state: ContractState, a: Amendment): ContractState {
  const s = structuredClone(state)
  const p = a.payload
  const num = (k: string) => (typeof p[k] === "number" ? (p[k] as number) : undefined)
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined)
  const isObj = (k: string) => p[k] != null && typeof p[k] === "object"

  switch (a.type) {
    case "rent_change": {
      const nr = num("newRent")
      if (nr != null) s.financials.monthlyRent = nr
      if (p.recalcDeposit === true && nr != null) s.financials.deposit.amount = nr
      break
    }
    case "indexation": {
      let pct = num("inflationPercent") ?? 0
      if (s.financials.indexation.enabled) pct = Math.min(pct, s.financials.indexation.capPercent)
      s.financials.monthlyRent = Math.round(s.financials.monthlyRent * (1 + pct / 100))
      break
    }
    case "set_operating_costs":
    case "change_operating_costs": {
      const method = str("method") as OperatingMethod | undefined
      if (method) s.financials.operatingCosts.method = method
      const scope = str("scope") as OperatingScope | undefined
      if (scope) s.financials.operatingCosts.scope = scope
      if (isObj("fixed")) s.financials.operatingCosts.fixed = p.fixed as OperatingCostsFixed
      if (isObj("pooled")) s.financials.operatingCosts.pooled = p.pooled as OperatingCostsPooled
      if (isObj("utilities")) Object.assign(s.financials.premisesUtilities, p.utilities)
      break
    }
    case "change_utilities": {
      if (isObj("utilities")) Object.assign(s.financials.premisesUtilities, p.utilities)
      if (isObj("services")) Object.assign(s.financials.additionalServices, p.services)
      break
    }
    case "change_area": {
      const na = num("newArea")
      if (na != null) s.premises.spaceAreaSqm = na
      const np = str("newPlacement")
      if (np != null) s.premises.placement = np
      break
    }
    case "extend_term": {
      const ned = str("newEndDate")
      if (ned) s.term.endDate = ned
      break
    }
    case "change_deposit": {
      const da = num("amount")
      if (da != null) s.financials.deposit.amount = da
      if ("installmentAllowed" in p) s.financials.deposit.installmentAllowed = p.installmentAllowed === true
      break
    }
    case "change_purpose": {
      const npu = str("newPurpose")
      if (npu) s.premises.purposeUse = npu
      break
    }
    case "change_requisites":
    case "assign_party": {
      const role = str("party")
      if (isObj("newParty")) {
        const data = p.newParty as Partial<Party>
        if (role === "landlord") Object.assign(s.landlord, data)
        else if (role === "tenant") Object.assign(s.tenant, data)
      }
      break
    }
    case "terminate":
    case "rent_holiday":
      // не меняют базовое содержание (жизненный цикл / временная оплата)
      break
  }
  return s
}

/** Эффективное состояние = база + ДС по порядку dsNumber. */
export function effectiveState(base: ContractState, list: Amendment[]): ContractState {
  return [...list]
    .sort((x, y) => x.dsNumber - y.dsNumber)
    .reduce((st, a) => applyAmendment(st, a), structuredClone(base))
}

// ───────────────────────── гейты (§9.3) ─────────────────────────

const GATES: Partial<Record<AmendmentType, (s: ContractState) => boolean>> = {
  set_operating_costs: (s) => s.financials.operatingCosts.method === "none",
  change_operating_costs: (s) => s.financials.operatingCosts.method !== "none",
}

/** Доступные типы ДС при текущем состоянии и статусе. ДС только в active/extended. */
export function availableAmendmentTypes(s: ContractState, status: ContractStatus): AmendmentType[] {
  if (status !== "active" && status !== "extended") return []
  // status здесь гарантированно active/extended — extend_term доступен (его гейт
  // «не terminating/terminated» уже выполнен ранним return выше).
  return AMENDMENT_TYPES.filter((t) => {
    const gate = GATES[t]
    return gate ? gate(s) : true
  })
}

// ───────────────────────── генерация текста ДС (§9.4) ─────────────────────────

export type AmendmentOpKind = "restate" | "add" | "remove"
export interface AmendmentOp {
  kind: AmendmentOpKind
  /** номер пункта в действующей редакции (для restate/remove) */
  ref?: string
  /** новый текст (для restate/add) */
  text?: string
}

function flattenClauses(a: AssemblyResult): Map<string, { num: string; text: string }> {
  const m = new Map<string, { num: string; text: string }>()
  for (const sec of a.sections) {
    for (const it of sec.items) {
      m.set(it.id, { num: it.num, text: (it.sub ? it.sub + " " : "") + it.html })
      for (const k of it.children) m.set(k.id, { num: k.num, text: k.html })
    }
  }
  return m
}

/** Операции ДС из diff сборки «до/после». Номера берутся из действующей редакции (prev). */
export function buildAmendmentOps(prev: ContractState, next: ContractState): AmendmentOp[] {
  const pf = flattenClauses(assemble(prev))
  const nf = flattenClauses(assemble(next))
  const ops: AmendmentOp[] = []
  for (const [id, pv] of pf) {
    const nv = nf.get(id)
    if (!nv) ops.push({ kind: "remove", ref: pv.num })
    else if (nv.text !== pv.text) ops.push({ kind: "restate", ref: pv.num, text: nv.text })
  }
  for (const [id, nv] of nf) {
    if (!pf.has(id)) ops.push({ kind: "add", text: nv.text })
  }
  return ops
}

export interface AmendmentDoc {
  ops: AmendmentOp[]
  text: string
  effective: ContractState
}

/** Рендер ДС-документа: операции + текст по шаблону §9.4. */
export function renderAmendment(base: ContractState, prior: Amendment[], amendment: Amendment): AmendmentDoc {
  const prev = effectiveState(base, prior)
  const next = effectiveState(base, [...prior, amendment])

  if (amendment.type === "terminate") {
    return { ops: [], text: renderTermination(prev, amendment), effective: next }
  }

  const ops = buildAmendmentOps(prev, next)
  const lines: string[] = []
  lines.push(`ДОПОЛНИТЕЛЬНОЕ СОГЛАШЕНИЕ № ${amendment.dsNumber}`)
  lines.push(`к Договору аренды № ${base.meta.contractNumber || "____"} от ${dateLong(base.meta.contractDate)}`)
  lines.push("")
  lines.push(`${base.meta.city}    ${dateLong(amendment.dsDate)}`)
  lines.push("")
  lines.push(`${partyIntro(prev.landlord, "Арендодатель")}, и ${partyIntro(prev.tenant, "Арендатор")}, заключили настоящее Дополнительное соглашение о нижеследующем:`)
  lines.push("")

  let i = 0
  for (const op of ops) {
    i++
    if (op.kind === "restate") lines.push(`${i}. Пункт ${op.ref} Договора изложить в следующей редакции: «${op.text}».`)
    else if (op.kind === "add") lines.push(`${i}. Договор дополнить пунктом следующего содержания: «${op.text}».`)
    else if (op.kind === "remove") lines.push(`${i}. Пункт ${op.ref} Договора исключить.`)
  }
  if (ops.length === 0) lines.push("1. Стороны подтверждают условия Договора без изменений по существу.")

  const n = ops.length || 1
  lines.push(`${n + 1}. Настоящее ДС вступает в силу с ${dateLong(amendment.effectiveDate)} и является неотъемлемой частью Договора.`)
  lines.push(`${n + 2}. В остальном условия Договора остаются неизменными.`)
  lines.push(`${n + 3}. ДС составлено в 2 экземплярах, по одному для каждой Стороны.`)

  return { ops, text: lines.join("\n"), effective: next }
}

function renderTermination(prev: ContractState, a: Amendment): string {
  const term = typeof a.payload.terminationDate === "string" ? a.payload.terminationDate : a.effectiveDate
  const lines: string[] = []
  lines.push(`СОГЛАШЕНИЕ О РАСТОРЖЕНИИ`)
  lines.push(`Договора аренды № ${prev.meta.contractNumber || "____"} от ${dateLong(prev.meta.contractDate)}`)
  lines.push("")
  lines.push(`${prev.meta.city}    ${dateLong(a.dsDate)}`)
  lines.push("")
  lines.push(`${partyIntro(prev.landlord, "Арендодатель")}, и ${partyIntro(prev.tenant, "Арендатор")}, заключили настоящее Соглашение о нижеследующем:`)
  lines.push("")
  lines.push(`1. Договор аренды расторгается с ${dateLong(term)}.`)
  lines.push(
    prev.modules.actEnabled
      ? "2. Помещение возвращается Арендодателю по Акту приёма-передачи (возврата) в день расторжения."
      : "2. Помещение возвращается Арендодателю в день расторжения; состояние при необходимости фиксируется Сторонами в свободной форме.",
  )
  lines.push("3. Стороны производят взаиморасчёт, включая возврат гарантийного депозита за вычетом удержаний согласно разделу о депозите.")
  lines.push("4. Соглашение составлено в 2 экземплярах, по одному для каждой Стороны.")
  return lines.join("\n")
}
