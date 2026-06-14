"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { X, Plus, Check, CalendarClock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CHARGE_TYPES, formatMoney } from "@/lib/utils"
import {
  getTenantUnpaidChargesForPlan,
  createInstallmentPlan,
  markInstallmentPaid,
  cancelInstallmentPlan,
} from "@/app/actions/installments"

type Debtor = { id: string; companyName: string; debt: number }
type ChargeOpt = {
  id: string
  type: string
  amount: number
  period: string
  description: string | null
  dueDate: Date | string | null
}

function firstOfNextMonthISO(): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10)
}

export function CreateInstallmentDialog({ debtors }: { debtors: Debtor[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tenantId, setTenantId] = useState("")
  const [charges, setCharges] = useState<ChargeOpt[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [count, setCount] = useState(3)
  const [firstDue, setFirstDue] = useState(firstOfNextMonthISO())
  const [note, setNote] = useState("")
  const [loadingCharges, setLoadingCharges] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function onPickTenant(id: string) {
    setTenantId(id)
    setCharges([])
    setSelected(new Set())
    setError(null)
    if (!id) return
    setLoadingCharges(true)
    try {
      const rows = await getTenantUnpaidChargesForPlan(id)
      setCharges(rows)
      setSelected(new Set(rows.map((r) => r.id)))
    } catch {
      setError("Не удалось загрузить начисления")
    } finally {
      setLoadingCharges(false)
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const total = charges.filter((c) => selected.has(c.id)).reduce((s, c) => s + c.amount, 0)
  const perPayment = count > 0 ? total / count : 0

  function reset() {
    setTenantId("")
    setCharges([])
    setSelected(new Set())
    setCount(3)
    setFirstDue(firstOfNextMonthISO())
    setNote("")
    setError(null)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-slate-900 hover:bg-slate-800 px-4 py-2 text-sm font-medium text-white"
      >
        <Plus className="h-4 w-4" />
        Оформить рассрочку
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
              <h2 className="text-base font-semibold">Рассрочка по долгу</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть" title="Закрыть">
                <X className="h-5 w-5 text-slate-400 dark:text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Арендатор-должник *</label>
                <select
                  value={tenantId}
                  onChange={(e) => onPickTenant(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900"
                >
                  <option value="">Выберите арендатора</option>
                  {debtors.map((d) => (
                    <option key={d.id} value={d.id}>{d.companyName} — долг {formatMoney(d.debt)}</option>
                  ))}
                </select>
              </div>

              {tenantId && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    Начисления в рассрочку {loadingCharges && "(загрузка…)"}
                  </label>
                  {charges.length === 0 && !loadingCharges ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500">Нет подходящих неоплаченных начислений (или все уже в рассрочке).</p>
                  ) : (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-800 p-2">
                      {charges.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
                          <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="rounded" />
                          <span className="flex-1">
                            {CHARGE_TYPES[c.type] ?? c.type} · {c.period}
                            {c.description ? ` · ${c.description}` : ""}
                          </span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{formatMoney(c.amount)}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tenantId && charges.length > 0 && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Число платежей *</label>
                      <input
                        type="number"
                        min={2}
                        max={60}
                        value={count}
                        onChange={(e) => setCount(Math.max(2, Math.min(60, parseInt(e.target.value, 10) || 2)))}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Первый платёж</label>
                      <input
                        type="date"
                        value={firstDue}
                        onChange={(e) => setFirstDue(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                    Долг к рассрочке: <span className="font-semibold">{formatMoney(total)}</span> · по{" "}
                    <span className="font-semibold">{formatMoney(perPayment)}</span> × {count} мес (ежемесячно)
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Примечание</label>
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Необязательно"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm"
                    />
                  </div>
                </>
              )}

              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">Отмена</Button>
                <Button
                  type="button"
                  loading={pending}
                  disabled={!tenantId || selected.size === 0}
                  className="flex-1"
                  onClick={() =>
                    startTransition(async () => {
                      setError(null)
                      const r = await createInstallmentPlan({
                        tenantId,
                        chargeIds: [...selected],
                        count,
                        firstDue,
                        note,
                      })
                      if (r?.error) {
                        setError(r.error)
                        return
                      }
                      setOpen(false)
                      reset()
                      router.refresh()
                    })
                  }
                >
                  {pending ? "Создание…" : "Создать рассрочку"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function MarkInstallmentPaidButton({ installmentId }: { installmentId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const r = await markInstallmentPaid(installmentId)
            if (r?.error) {
              setError(r.error)
              return
            }
            router.refresh()
          })
        }
        className="flex items-center gap-1 text-[11px] rounded-full px-2.5 py-0.5 border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 disabled:opacity-60"
      >
        <Check className="h-3 w-3" />
        {pending ? "…" : "Оплачен"}
      </button>
      {error && <span className="text-[10px] text-red-600 dark:text-red-400">{error}</span>}
    </span>
  )
}

export function CancelPlanButton({ planId }: { planId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Отменить рассрочку? Начисления вернутся в обычный режим (пеня снова будет начисляться).")) return
        startTransition(async () => {
          await cancelInstallmentPlan(planId)
          router.refresh()
        })
      }}
      className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 disabled:opacity-60"
      title="Отменить рассрочку"
    >
      <CalendarClock className="h-3 w-3" />
      Отменить
    </button>
  )
}
