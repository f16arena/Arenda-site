"use client"
import { ModalShell } from "@/components/ui/modal"
import { askConfirm } from "@/components/ui/dialog-host"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { X, Plus, Check, CalendarClock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLocale, useT } from "@/lib/i18n/client"
import { formatMoneyL } from "@/lib/i18n/format"
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
  const { t } = useT()
  const locale = useLocale()
  const money = (amount: number) => formatMoneyL(locale, amount)
  const chargeTypeLabel = (type: string) => {
    const key = `domain.chargeTypes.${type}` as Parameters<typeof t>[0]
    const label = t(key)
    return label === key ? type : label
  }
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
      setError(t("adminFinance.installments.create.loadFailed"))
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
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        {t("adminFinance.installments.create.trigger")}
      </Button>

      <ModalShell open={open} onClose={() => setOpen(false)} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900">
              <h2 className="text-base font-semibold">{t("adminFinance.installments.create.title")}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("common.actions.close")} title={t("common.actions.close")}>
                <X className="h-5 w-5 text-slate-400 dark:text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.installments.create.tenant")}</label>
                <select
                  value={tenantId}
                  onChange={(e) => onPickTenant(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900"
                >
                  <option value="">{t("adminFinance.installments.create.tenantPlaceholder")}</option>
                  {debtors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {t("adminFinance.installments.create.tenantOption", { name: d.companyName, amount: money(d.debt) })}
                    </option>
                  ))}
                </select>
              </div>

              {tenantId && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                    {t("adminFinance.installments.create.charges")} {loadingCharges && t("adminFinance.installments.create.loading")}
                  </label>
                  {charges.length === 0 && !loadingCharges ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500">{t("adminFinance.installments.create.chargesEmpty")}</p>
                  ) : (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-800 p-2">
                      {charges.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
                          <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="rounded" />
                          <span className="flex-1">
                            {chargeTypeLabel(c.type)} · {c.period}
                            {c.description ? ` · ${c.description}` : ""}
                          </span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{money(c.amount)}</span>
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
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.installments.create.count")}</label>
                      <Input
                        type="number"
                        min={2}
                        max={60}
                        value={count}
                        onChange={(e) => setCount(Math.max(2, Math.min(60, parseInt(e.target.value, 10) || 2)))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.installments.create.firstDue")}</label>
                      <Input
                        type="date"
                        value={firstDue}
                        onChange={(e) => setFirstDue(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                    {t("adminFinance.installments.create.summary", {
                      total: money(total),
                      perPayment: money(perPayment),
                      count,
                    })}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminFinance.installments.create.note")}</label>
                    <Input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={t("adminFinance.installments.create.notePlaceholder")}
                    />
                  </div>
                </>
              )}

              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">{t("common.actions.cancel")}</Button>
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
                  {pending ? t("adminFinance.installments.create.submitting") : t("adminFinance.installments.create.submit")}
                </Button>
              </div>
            </div>
          </ModalShell>
    </>
  )
}

export function MarkInstallmentPaidButton({ installmentId }: { installmentId: string }) {
  const router = useRouter()
  const { t } = useT()
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
        {pending ? "…" : t("adminFinance.installments.markPaid")}
      </button>
      {error && <span className="text-[10px] text-red-600 dark:text-red-400">{error}</span>}
    </span>
  )
}

export function CancelPlanButton({ planId }: { planId: string }) {
  const router = useRouter()
  const { t } = useT()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        const confirmed = await askConfirm({
          title: t("adminFinance.installments.cancelTitle"),
          description: t("adminFinance.installments.cancelText"),
          confirmLabel: t("adminFinance.installments.cancelConfirm"),
          danger: true,
        })
        if (!confirmed) return
        startTransition(async () => {
          await cancelInstallmentPlan(planId)
          router.refresh()
        })
      }}
      className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 disabled:opacity-60"
      title={t("adminFinance.installments.cancelConfirm")}
    >
      <CalendarClock className="h-3 w-3" />
      {t("adminFinance.installments.cancel")}
    </button>
  )
}
