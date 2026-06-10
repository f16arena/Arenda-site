"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CalendarPlus, Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { createExtensionAddendum } from "@/app/actions/contract-addendums"

function addMonths(base: Date, months: number): string {
  const d = new Date(base)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

/**
 * Продление договора в 1 клик: создаёт ДС о продлении (EXTEND_TERM) и сразу
 * отправляет арендатору на подпись. Базовые варианты +6/+12 мес или своя дата.
 */
export function RenewContractButton({
  contractId,
  contractNumber,
  currentEnd,
}: {
  contractId: string
  contractNumber: string
  currentEnd: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const base = currentEnd ? new Date(currentEnd) : new Date()
  const [date, setDate] = useState(() => addMonths(base, 12))
  const [pending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const r = await createExtensionAddendum(contractId, date)
      if (!r.ok) { toast.error(r.error ?? "Не удалось создать ДС"); return }
      toast.success("ДС о продлении создано и отправлено арендатору на подпись")
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Продлить договор № ${contractNumber}: ДС уйдёт арендатору на подпись`}
        className="flex items-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-300"
      >
        <CalendarPlus className="h-4 w-4" />
        Продлить
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Продление договора № {contractNumber}</h3>
              <button onClick={() => setOpen(false)} aria-label="Закрыть" className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Будет создано доп. соглашение о продлении{currentEnd ? ` (сейчас договор до ${new Date(currentEnd).toLocaleDateString("ru-RU")})` : ""} и сразу отправлено арендатору на подпись.
                Остальные условия не меняются.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDate(addMonths(base, 6))}
                  className={`rounded-lg border px-3 py-2 text-sm ${date === addMonths(base, 6) ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"}`}
                >
                  +6 месяцев
                </button>
                <button
                  type="button"
                  onClick={() => setDate(addMonths(base, 12))}
                  className={`rounded-lg border px-3 py-2 text-sm ${date === addMonths(base, 12) ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"}`}
                >
                  +12 месяцев
                </button>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Новая дата окончания</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-6 py-4">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-2 text-sm text-slate-600 dark:text-slate-400">Отмена</button>
              <button
                onClick={submit}
                disabled={pending || !date}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
                Создать и отправить
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
