// Детерминированный текстовый рендер акта сверки.

import { money, moneyWithWords } from "@/lib/contract-engine"
import { periodLabel } from "@/lib/avr-engine"
import { type ReconState, reconDebit, reconCredit, reconClosing } from "./schema"

/** «октября 2026 г. — мая 2026 г.» из периода {from,to}. */
export function reconPeriodLabel(p: { from: string; to: string }): string {
  const a = periodLabel(p.from)
  const b = periodLabel(p.to)
  return a === b ? a : `${a} — ${b}`
}

/** ДД.ММ.ГГГГ из ISO. */
export function fmtEntryDate(iso: string): string {
  const [y, m, d] = (iso || "").split("-")
  if (!y || !m || !d) return iso || "—"
  return `${d}.${m}.${y}`
}

export function renderReconText(s: ReconState): string {
  const out: string[] = []
  out.push("АКТ СВЕРКИ ВЗАИМНЫХ РАСЧЁТОВ")
  out.push(`Номер: ${s.meta.number || "—"} · Дата: ${s.meta.date || "—"}`)
  out.push(`Период: ${reconPeriodLabel(s.period)}`)
  out.push(`Между: ${s.org.name || "—"} (ИИН/БИН ${s.org.binIin || "—"}) и ${s.tenant.name || "—"} (ИИН/БИН ${s.tenant.binIin || "—"})`)
  out.push("")
  out.push(`Входящее сальдо: ${money(s.openingBalance)}`)
  out.push("Операции (дебет — начислено, кредит — оплачено):")
  s.entries.forEach((e, i) => {
    out.push(`${i + 1}. ${fmtEntryDate(e.date)} | ${e.doc || "—"} | дебет: ${money(e.debit)} | кредит: ${money(e.credit)}`)
  })
  out.push("")
  out.push(`Обороты: начислено ${money(reconDebit(s))}, оплачено ${money(reconCredit(s))}`)
  const closing = reconClosing(s)
  out.push(`Исходящее сальдо: ${money(closing)}`)
  if (closing > 0) out.push(`Задолженность в пользу ${s.org.name || "Арендодателя"}: ${moneyWithWords(closing)}`)
  else if (closing < 0) out.push(`Переплата в пользу ${s.tenant.name || "Арендатора"}: ${moneyWithWords(-closing)}`)
  else out.push("Взаимная задолженность отсутствует.")
  out.push("")
  out.push(`От ${s.org.name || "Арендодателя"}: ${s.org.signatory || "____"} ____________ М.П.`)
  out.push(`От ${s.tenant.name || "Арендатора"}: ${s.tenant.signatory || "____"} ____________ М.П.`)
  return out.join("\n")
}
