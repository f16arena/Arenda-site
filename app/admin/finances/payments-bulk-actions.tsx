"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Trash2, X, Loader2, Receipt } from "lucide-react"
import { formatMoney, PAYMENT_METHOD_LABELS } from "@/lib/utils"
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

export function PaymentsBulkActions({ payments }: { payments: PaymentRow[] }) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()

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
      toast.success(`Удалено платежей: ${deletedIds.length}`, {
        action: {
          label: "Отменить",
          onClick: async () => {
            const errors: string[] = []
            for (const id of deletedIds) {
              const r = await restorePayment(id)
              if (!r.ok) errors.push(r.error)
            }
            if (errors.length > 0) toast.error(errors[0] ?? "Не удалось восстановить часть записей")
            else toast.success("Восстановлено")
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
            Выбрано: {selectedIds.size}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <ConfirmDialog
              variant="danger"
              title={`Удалить ${selectedIds.size} ${pluralizePayments(selectedIds.size)}?`}
              description="Записи будут помещены в корзину. Сразу после действия можно отменить."
              confirmLabel="Удалить"
              onConfirm={handleBulkDelete}
              trigger={
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pending}
                  leftIcon={pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                >
                  Удалить выбранные
                </Button>
              }
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              disabled={pending}
              leftIcon={<X className="h-3.5 w-3.5" />}
            >
              Отмена
            </Button>
          </div>
        </div>
      )}

      {payments.length > 0 && (
        <div className="flex items-center gap-2 px-5 py-2 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
          <input
            type="checkbox"
            aria-label="Выделить все"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected
            }}
            onChange={toggleAll}
            className="cursor-pointer"
          />
          <span>{allSelected ? "Снять выделение" : "Выделить все на странице"}</span>
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
                aria-label={`Выбрать платёж ${p.tenantName}`}
                checked={checked}
                onChange={() => toggleOne(p.id)}
                className="cursor-pointer"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{p.tenantName}</p>
                <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                  {p.paymentDate.toLocaleDateString("ru-RU")} · {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatMoney(p.amount)}</p>
                {p.method === "CASH" && (
                  <Link
                    href={`/admin/finances/receipt/${p.id}`}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                    title="Квитанция о приёме наличных"
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    Квитанция
                  </Link>
                )}
                <DeleteWithUndo
                  deleteAction={deletePayment.bind(null, p.id)}
                  restoreAction={restorePayment.bind(null, p.id)}
                  entity="платёж"
                  successMessage="Платёж удалён"
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function pluralizePayments(n: number) {
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return "платежей"
  const last = n % 10
  if (last === 1) return "платёж"
  if (last >= 2 && last <= 4) return "платежа"
  return "платежей"
}
