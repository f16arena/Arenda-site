"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { setTenantServiceFeeExempt } from "@/app/actions/tenant"

/**
 * Переключатель «без эксплуатационного сбора» для арендатора. Работает даже при
 * подписанном договоре — это исключение из биллинга сбора, а не условие аренды.
 */
export function ServiceFeeExemptToggle({
  tenantId,
  exempt,
  disabled,
}: {
  tenantId: string
  exempt: boolean
  disabled?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function onChange(next: boolean) {
    startTransition(async () => {
      const r = await setTenantServiceFeeExempt(tenantId, next)
      if (!r.ok) { toast.error(r.error ?? "Не удалось сохранить"); return }
      toast.success(next
        ? "Эксплуатационный сбор отключён для этого арендатора"
        : "Эксплуатационный сбор включён для этого арендатора")
      router.refresh()
    })
  }

  return (
    <div className="mx-5 mb-5 rounded-lg border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
      <label className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={exempt}
          disabled={disabled || pending}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 rounded border-slate-300 disabled:cursor-not-allowed"
        />
        <span>
          <span className="font-medium text-slate-900 dark:text-slate-100">Без эксплуатационного сбора</span>
          <span className="mt-0.5 block text-[11px] text-slate-400 dark:text-slate-500">
            Если включено — строка «Эксплуатационные расходы» не добавляется этому арендатору в счёт, АВР, ЭСФ
            и авто-начисления. Сбор по зданию настраивается отдельно.
          </span>
        </span>
      </label>
    </div>
  )
}
