// Чистая логика рассрочки (без БД) — график платежей и подписи статусов.

export type InstallmentDraft = { seq: number; dueDateISO: string; amount: number }

export const INSTALLMENT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Активна",
  COMPLETED: "Погашена",
  BROKEN: "Сорвана",
  CANCELLED: "Отменена",
}

export const MAX_INSTALLMENTS = 60
export const MIN_INSTALLMENTS = 2

// Делит сумму на N равных взносов (в копейках, без потери остатка — последний
// взнос забирает округление). dueDate шагает помесячно от firstDue.
export function buildInstallmentSchedule(total: number, count: number, firstDue: Date): InstallmentDraft[] {
  const n = Math.max(1, Math.min(Math.trunc(count), MAX_INSTALLMENTS))
  const cents = Math.round(total * 100)
  const base = Math.floor(cents / n)
  const out: InstallmentDraft[] = []
  let allocated = 0
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1
    const amtCents = isLast ? cents - allocated : base
    allocated += amtCents
    const due = new Date(firstDue.getFullYear(), firstDue.getMonth() + i, firstDue.getDate())
    out.push({ seq: i + 1, dueDateISO: due.toISOString(), amount: amtCents / 100 })
  }
  return out
}
