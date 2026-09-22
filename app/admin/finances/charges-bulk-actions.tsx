"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Trash2, CheckCircle2, X, Loader2 } from "lucide-react"
import { useLocale, useT } from "@/lib/i18n/client"
import { formatMoneyL } from "@/lib/i18n/format"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  bulkMarkChargesPaid,
  bulkDeleteCharges,
  deleteCharge,
  restoreCharge,
  waivePenalty,
  unwaivePenalty,
} from "@/app/actions/finance"
import { useRouter } from "next/navigation"

export interface ChargeRow {
  id: string
  tenantName: string
  type: string
  amount: number
  isPaid: boolean
}

export function ChargesBulkActions({
  charges,
  canMarkPaid = false,
  canDelete = false,
}: {
  charges: ChargeRow[]
  canMarkPaid?: boolean
  canDelete?: boolean
}) {
  const router = useRouter()
  const { t, tp } = useT()
  const locale = useLocale()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const chargeTypeLabel = (type: string) => {
    const key = `domain.chargeTypes.${type}` as Parameters<typeof t>[0]
    const label = t(key)
    return label === key ? type : label
  }

  const allSelected = charges.length > 0 && charges.every((c) => selectedIds.has(c.id))
  const someSelected = selectedIds.size > 0 && !allSelected

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(charges.map((c) => c.id)))
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  function handleMarkPaid() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    startTransition(async () => {
      const result = await bulkMarkChargesPaid(ids)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(t("adminFinance.chargesList.markedPaid", { count: result.updated }))
      setSelectedIds(new Set())
      router.refresh()
    })
  }

  function handleBulkDelete() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    startTransition(async () => {
      const result = await bulkDeleteCharges(ids)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const deletedIds = result.deleted
      setSelectedIds(new Set())
      router.refresh()
      toast.success(t("adminFinance.chargesList.deleted", { count: deletedIds.length }), {
        action: {
          label: t("adminFinance.chargesList.undo"),
          onClick: async () => {
            const errors: string[] = []
            for (const id of deletedIds) {
              const r = await restoreCharge(id)
              if (!r.ok) errors.push(r.error)
            }
            if (errors.length > 0) toast.error(errors[0] ?? t("adminFinance.chargesList.restoreFailed"))
            else toast.success(t("adminFinance.chargesList.restored"))
            router.refresh()
          },
        },
        duration: 6000,
      })
    })
  }

  function handleWaivePenalty(id: string) {
    startTransition(async () => {
      const r = await waivePenalty(id)
      if (!r.ok) {
        toast.error(r.error)
        return
      }
      router.refresh()
      toast.success(t("adminFinance.chargesList.penaltyWaived"), {
        action: {
          label: t("adminFinance.chargesList.penaltyBack"),
          onClick: async () => {
            const u = await unwaivePenalty(id)
            if (!u.ok) toast.error(u.error)
            else toast.success(t("adminFinance.chargesList.penaltyRestored"))
            router.refresh()
          },
        },
        duration: 6000,
      })
    })
  }

  function handleSingleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteCharge(id)
        router.refresh()
        toast.success(t("adminFinance.chargesList.deletedOne"), {
          action: {
            label: t("adminFinance.chargesList.undo"),
            onClick: async () => {
              const r = await restoreCharge(id)
              if (!r.ok) toast.error(r.error)
              else toast.success(t("adminFinance.chargesList.restored"))
              router.refresh()
            },
          },
          duration: 6000,
        })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("adminFinance.chargesList.deleteFailed"))
      }
    })
  }

  return (
    <div>
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 mx-5 my-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 dark:border-blue-500/30 dark:bg-blue-500/10">
          <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
            {t("adminFinance.chargesList.selected", { count: selectedIds.size })}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {canMarkPaid && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleMarkPaid}
              disabled={pending}
              leftIcon={pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            >
              {t("adminFinance.chargesList.markPaid")}
            </Button>
            )}
            {canDelete && (
            <ConfirmDialog
              variant="danger"
              title={tp("adminFinance.chargesList.deleteTitle", selectedIds.size)}
              description={t("adminFinance.chargesList.deleteText")}
              confirmLabel={t("common.actions.delete")}
              onConfirm={handleBulkDelete}
              trigger={
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pending}
                  leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                >
                  {t("common.actions.delete")}
                </Button>
              }
            />
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              disabled={pending}
              leftIcon={<X className="h-3.5 w-3.5" />}
            >
              {t("common.actions.cancel")}
            </Button>
          </div>
        </div>
      )}

      {charges.length > 0 && (
        <div className="flex items-center gap-2 px-5 py-2 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
          <input
            type="checkbox"
            aria-label={t("adminFinance.chargesList.selectAll")}
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected
            }}
            onChange={toggleAll}
            className="cursor-pointer"
          />
          <span>{allSelected ? t("adminFinance.chargesList.unselectAll") : t("adminFinance.chargesList.selectAllOnPage")}</span>
        </div>
      )}

      <div className="divide-y divide-slate-50 dark:divide-slate-800/60">
        {charges.map((c) => {
          const checked = selectedIds.has(c.id)
          return (
            <div
              key={c.id}
              className={`flex items-center justify-between gap-3 px-5 py-3 transition-colors ${
                checked ? "bg-blue-50/60 dark:bg-blue-500/5" : ""
              }`}
            >
              <input
                type="checkbox"
                aria-label={t("adminFinance.chargesList.selectOne", { name: c.tenantName })}
                checked={checked}
                onChange={() => toggleOne(c.id)}
                className="cursor-pointer"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{c.tenantName}</p>
                <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                  {chargeTypeLabel(c.type)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatMoneyL(locale, c.amount)}</p>
                  <span className={`text-xs ${c.isPaid ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                    {c.isPaid ? t("adminFinance.chargesList.paid") : t("adminFinance.chargesList.unpaid")}
                  </span>
                </div>
                {canDelete && (c.type === "PENALTY" ? (
                  <ConfirmDialog
                    variant="danger"
                    title={t("adminFinance.chargesList.waivePenaltyTitle")}
                    description={t("adminFinance.chargesList.waivePenaltyText")}
                    confirmLabel={t("adminFinance.chargesList.waivePenalty")}
                    onConfirm={() => handleWaivePenalty(c.id)}
                    trigger={
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded-md border border-amber-300 px-2 py-1 text-[11px] font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10"
                      >
                        {t("adminFinance.chargesList.waivePenalty")}
                      </button>
                    }
                  />
                ) : (
                  <ConfirmDialog
                    variant="danger"
                    title={t("adminFinance.chargesList.deleteOneTitle")}
                    description={t("adminFinance.chargesList.deleteOneText")}
                    confirmLabel={t("common.actions.delete")}
                    onConfirm={() => handleSingleDelete(c.id)}
                    trigger={
                      <button
                        type="button"
                        disabled={pending}
                        aria-label={t("adminFinance.chargesList.deleteOne")}
                        className="text-red-400 hover:text-red-600 dark:text-red-400 disabled:opacity-50 inline-flex items-center"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    }
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
