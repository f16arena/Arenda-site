// Модель данных конструктора «Акт сверки взаимных расчётов».
// Дебет = начислено (долг арендатора растёт), Кредит = оплачено (долг гасится).
// Сальдо > 0 — задолженность в пользу организации (арендодателя).

export type ReconPartyType = "too" | "ip" | "individual"

export interface ReconParty {
  type: ReconPartyType
  name: string
  binIin: string
  signatory: string
  position: string
}

export interface ReconEntry {
  date: string // ISO YYYY-MM-DD
  doc: string // операция/документ
  debit: number // начислено
  credit: number // оплачено
}

export interface ReconState {
  meta: { number: string; date: string; city: string } // дата составления (ISO)
  period: { from: string; to: string } // YYYY-MM
  org: ReconParty // наша сторона (арендодатель)
  tenant: ReconParty // арендатор
  openingBalance: number // входящее сальдо (>0 — долг арендатора)
  entries: ReconEntry[]
}

export function reconDebit(s: ReconState): number {
  return s.entries.reduce((sum, e) => sum + (e.debit || 0), 0)
}
export function reconCredit(s: ReconState): number {
  return s.entries.reduce((sum, e) => sum + (e.credit || 0), 0)
}
/** Исходящее сальдо = входящее + начислено − оплачено. */
export function reconClosing(s: ReconState): number {
  return Math.round((s.openingBalance || 0) + reconDebit(s) - reconCredit(s))
}

export function defaultReconParty(): ReconParty {
  return { type: "too", name: "", binIin: "", signatory: "", position: "Директор" }
}
export function defaultReconState(): ReconState {
  return {
    meta: { number: "", date: "", city: "г. Усть-Каменогорск" },
    period: { from: "", to: "" },
    org: defaultReconParty(),
    tenant: defaultReconParty(),
    openingBalance: 0,
    entries: [],
  }
}
