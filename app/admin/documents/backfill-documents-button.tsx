"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FilePlus2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { backfillMonthlyDocuments } from "@/app/actions/auto-documents-backfill"

/**
 * «Счета и АВР за месяц»: выбор периода → создать счета и АВР по всем подписанным
 * договорам за этот месяц (напр. закрыть и июнь, и июль). Идемпотентно — уже
 * созданные не дублируются.
 */
function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function BackfillDocumentsButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState(currentMonth())

  function run() {
    if (!/^\d{4}-\d{2}$/.test(period)) { toast.error("Выберите месяц"); return }
    startTransition(async () => {
      const r = await backfillMonthlyDocuments(period)
      if (!r.ok) { toast.error(r.error); return }
      if (r.created === 0) {
        toast.info(`За ${r.period} все счета и АВР уже созданы (${r.tenants} арендаторов с договорами)`)
      } else {
        toast.success(`Создано за ${r.period}: ${r.created} — лежат ниже, ждут вашей подписи ЭЦП`)
      }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        title="Создать счета и АВР за выбранный месяц по всем подписанным договорам (уже созданные не дублируются)"
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
        {pending ? "Генерация…" : "Счета и АВР за месяц"}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">Период (месяц)</label>
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
              Создаст счета и АВР по всем подписанным договорам за этот месяц. Уже созданные не дублируются — можно закрыть и июнь, и июль.
            </p>
            <button
              type="button"
              onClick={run}
              disabled={pending}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePlus2 className="h-4 w-4" />}
              {pending ? "Генерация…" : "Сгенерировать"}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
