"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Trash2, CheckCircle2, X, Loader2 } from "lucide-react"
import { CHARGE_TYPES, formatMoney } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  bulkMarkChargesPaid,
  bulkDeleteCharges,
  deleteCharge,
  restoreCharge,
} from "@/app/actions/finance"
import { useRouter } from "next/navigation"

export interface ChargeRow {
  id: string
  tenantName: string
  type: string
  amount: number
  isPaid: boolean
}

export function ChargesBulkActions({ charges }: { charges: ChargeRow[] }) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()

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
      toast.success(`Отмечено оплаченными: ${result.updated}`)
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
      toast.success(`Удалено начислений: ${deletedIds.length}`, {
        action: {
          label: "Отменить",
          onClick: async () => {
            const errors: string[] = []
            for (const id of deletedIds) {
              const r = await restoreCharge(id)
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

  function handleSingleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteCharge(id)
        router.refresh()
        toast.success("Начисление удалено", {
          action: {
            label: "Отменить",
            onClick: async () => {
              const r = await restoreCharge(id)
              if (!r.ok) toast.error(r.error)
              else toast.success("Восстановлено")
              router.refresh()
            },
          },
          duration: 6000,
        })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось удалить")
      }
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
            <Button
              variant="primary"
              size="sm"
              onClick={handleMarkPaid}
              disabled={pending}
              leftIcon={pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            >
              Отметить оплаченными
            </Button>
            <ConfirmDialog
              variant="danger"
              title={`Удалить ${selectedIds.size} ${pluralizeCharges(selectedIds.size)}?`}
              description="Записи будут помещены в корзину. Сразу после действия можно отменить."
              confirmLabel="Удалить"
              onConfirm={handleBulkDelete}
              trigger={
                <Button
                  variant="danger"
                  size="sm"
                  disabled={pending}
                  leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                >
                  Удалить
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

      {charges.length > 0 && (
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
          <span>{allSelected ? "Снять выделение" : someSelected ? "Выделить все на странице" : "Выделить все на странице"}</span>
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
                aria-label={`Выбрать начисление ${c.tenantName}`}
                checked={checked}
                onChange={() => toggleOne(c.id)}
                className="cursor-pointer"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{c.tenantName}</p>
                <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                  {CHARGE_TYPES[c.type] ?? c.type}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatMoney(c.amount)}</p>
                  <span className={`text-xs ${c.isPaid ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                    {c.isPaid ? "Оплачено" : "Не оплачено"}
                  </span>
                </div>
                <ConfirmDialog
                  variant="danger"
                  title="Удалить начисление?"
                  description="Запись будет помещена в корзину. Сразу после действия можно отменить."
                  confirmLabel="Удалить"
                  onConfirm={() => handleSingleDelete(c.id)}
                  trigger={
                    <button
                      type="button"
                      disabled={pending}
                      aria-label="Удалить начисление"
                      className="text-red-400 hover:text-red-600 dark:text-red-400 disabled:opacity-50 inline-flex items-center"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  }
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function pluralizeCharges(n: number) {
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return "начислений"
  const last = n % 10
  if (last === 1) return "начисление"
  if (last >= 2 && last <= 4) return "начисления"
  return "начислений"
}
