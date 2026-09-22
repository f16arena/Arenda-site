"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Trash2, X, Loader2, Receipt } from "lucide-react"
import { useLocale, useT } from "@/lib/i18n/client"
import { formatDateShortL, formatMoneyL } from "@/lib/i18n/format"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DeleteWithUndo } from "@/components/ui/delete-with-undo"
import {
  bulkDeletePayments,
  deletePayment,
  restorePayment,
} from "@/app/actions/finance"

export interface PaymentRow {
  id: string
  tenantName: string
  amount: number
  method: string
  paymentDate: Date
}

export function PaymentsBulkActions({
  payments,
  canDelete = false,
}: {
  payments: PaymentRow[]
  canDelete?: boolean
}) {
  const router = useRouter()
  const { t, tp } = useT()
  const locale = useLocale()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()
  const methodLabel = (method: string) => {
    const key = `domain.paymentMethods.${method}` as Parameters<typeof t>[0]
    const label = t(key)
    return label === key ? method : label
  }

  const allSelected = payments.length > 0 && payments.every((p) => selectedIds.has(p.id))
  const someSelected = selectedIds.size > 0 && !allSelected

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(payments.map((p) => p.id)))
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  function handleBulkDelete() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    startTransition(async () => {
      const result = await bulkDeletePayments(ids)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const deletedIds = result.deleted
      setSelectedIds(new Set())
      router.refresh()
      toast.success(t("adminFinance.paymentsList.deleted", { count: deletedIds.length }), {
        action: {
          label: t("adminFinance.paymentsList.undo"),
          onClick: async () => {
            const errors: string[] = []
            for (const id of deletedIds) {
              const r = await restorePayment(id)
              if (!r.ok) errors.push(r.error)
            }
            if (errors.length > 0) toast.error(errors[0] ?? t("adminFinance.paymentsList.restoreFailed"))
            else toast.success(t("adminFinance.paymentsList.restored"))
            router.refresh()
          },
        },
        duration: 6000,
      })
    })
  }

  return (
    <div>
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 mx-5 my-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 dark:border-blue-500/30 dark:bg-blue-500/10">
          <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
            {t("adminFinance.paymentsList.selected", { count: selectedIds.size })}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {canDelete && (
            <ConfirmDialog
              variant="danger"
              title={tp("adminFinance.paymentsList.deleteTitle", selectedIds.size)}
              description={t("adminFinance.paymentsList.deleteText")}
              confirmLabel={t("common.actions.delete")}
              onConfirm={handleBulkDelete}
              trigger={
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pending}
                  leftIcon={pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                >
                  {t("adminFinance.paymentsList.deleteSelected")}
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

      {payments.length > 0 && (
        <div className="flex items-center gap-2 px-5 py-2 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
          <input
            type="checkbox"
            aria-label={t("adminFinance.paymentsList.selectAll")}
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected
            }}
            onChange={toggleAll}
            className="cursor-pointer"
          />
          <span>{allSelected ? t("adminFinance.paymentsList.unselectAll") : t("adminFinance.paymentsList.selectAllOnPage")}</span>
        </div>
      )}

      <div className="divide-y divide-slate-50 dark:divide-slate-800/60">
        {payments.map((p) => {
          const checked = selectedIds.has(p.id)
          return (
            <div
              key={p.id}
              className={`flex items-center justify-between gap-3 px-5 py-3 transition-colors ${
                checked ? "bg-blue-50/60 dark:bg-blue-500/5" : ""
              }`}
            >
              <input
                type="checkbox"
                aria-label={t("adminFinance.paymentsList.selectOne", { name: p.tenantName })}
                checked={checked}
                onChange={() => toggleOne(p.id)}
                className="cursor-pointer"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{p.tenantName}</p>
                <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                  {formatDateShortL(locale, p.paymentDate)} · {methodLabel(p.method)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatMoneyL(locale, p.amount)}</p>
                {p.method === "CASH" && (
                  <Link
                    href={`/admin/finances/receipt/${p.id}`}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                    title={t("adminFinance.paymentsList.receiptTitle")}
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    {t("adminFinance.paymentsList.receipt")}
                  </Link>
                )}
                {canDelete && (
                <DeleteWithUndo
                  deleteAction={deletePayment.bind(null, p.id)}
                  restoreAction={restorePayment.bind(null, p.id)}
                  entity={t("adminFinance.paymentsList.entity")}
                  successMessage={t("adminFinance.paymentsList.deletedOne")}
                />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
