"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { saveTenantServiceCharges } from "@/app/actions/finance"
import { SERVICE_CHARGE_TYPES } from "@/lib/service-charges"

type ExistingServiceCharge = {
  id: string
  type: string
  amount: number
  description: string | null
}

type Props = {
  tenantId: string
  period: string
  defaultDueDate: string
  existingCharges: ExistingServiceCharge[]
}

const inputClass =
  "w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:bg-slate-800/70"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось сохранить начисления"
}

export function ServiceChargesForm({ tenantId, period, defaultDueDate, existingCharges }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const existingByType = useMemo(() => {
    return new Map(existingCharges.map((charge) => [charge.type, charge]))
  }, [existingCharges])
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const item of SERVICE_CHARGE_TYPES) initial[item.type] = existingByType.has(item.type)
    return initial
  })

  const submit = (formData: FormData) => {
    startTransition(async () => {
      try {
        const result = await saveTenantServiceCharges(tenantId, formData)
        const parts = [
          result.created > 0 ? `создано: ${result.created}` : null,
          result.updated > 0 ? `обновлено: ${result.updated}` : null,
        ].filter(Boolean)
        toast.success(parts.length > 0 ? `Начисления сохранены (${parts.join(", ")})` : "Начисления сохранены")
        router.refresh()
      } catch (error) {
        toast.error(getErrorMessage(error))
      }
    })
  }

  return (
    <form action={submit} className="p-5 space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
            Период
          </label>
          <input
            name="period"
            type="month"
            defaultValue={period}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
            Срок оплаты
          </label>
          <input
            name="dueDate"
            type="date"
            defaultValue={defaultDueDate}
            className={inputClass}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
        <div className="hidden gap-3 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 dark:bg-slate-800/50 dark:text-slate-400 md:grid md:grid-cols-[minmax(130px,1fr)_minmax(120px,180px)_minmax(160px,1fr)]">
          <span>Услуга</span>
          <span>Сумма</span>
          <span>Комментарий</span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {SERVICE_CHARGE_TYPES.map((item) => {
            const active = enabled[item.type]
            const existing = existingByType.get(item.type)
            return (
              <div
                key={item.type}
                className="grid grid-cols-1 gap-3 px-3 py-3 md:grid-cols-[minmax(130px,1fr)_minmax(120px,180px)_minmax(160px,1fr)] md:items-center"
              >
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  <input
                    name="services"
                    value={item.type}
                    type="checkbox"
                    checked={active}
                    onChange={(event) => {
                      setEnabled((prev) => ({ ...prev, [item.type]: event.target.checked }))
                    }}
                    className="rounded border-slate-300"
                  />
                  {item.label}
                </label>
                <input
                  name={`amount_${item.type}`}
                  type="number"
                  step="0.01"
                  min={0}
                  required={active}
                  disabled={!active || pending}
                  defaultValue={existing?.amount ?? ""}
                  placeholder="0"
                  className={inputClass}
                />
                <input
                  name={`description_${item.type}`}
                  disabled={!active || pending}
                  defaultValue={existing?.description ?? ""}
                  placeholder={item.description}
                  className={inputClass}
                />
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700"
        >
          {pending ? "Сохранение..." : "Сохранить начисления"}
        </button>
      </div>
    </form>
  )
}
