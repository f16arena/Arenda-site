"use client"

import { useState, useTransition } from "react"
import { Zap, Check } from "lucide-react"
import { toast } from "sonner"
import { generateMonthlyChargesForOrg } from "@/app/actions/billing-batch"

export function BatchBillingButton({ defaultPeriod }: { defaultPeriod: string }) {
  const [open, setOpen] = useState(false)
  const [period, setPeriod] = useState(defaultPeriod)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ rent: number; cleaning: number; skipped: number; total: number } | null>(null)

  const run = () => {
    if (!window.confirm(
      `Сгенерировать начисления аренды (и уборки) за период ${period}?\n\n` +
      `Идемпотентно: уже созданные начисления за этот месяц пропускаются.\n` +
      `Арендаторам отправится in-app уведомление о начислении.`,
    )) return
    startTransition(async () => {
      const r = await generateMonthlyChargesForOrg(period)
      if (!r.ok) { toast.error(r.error); return }
      setResult({
        rent: r.rentCreated,
        cleaning: r.cleaningCreated,
        skipped: r.skipped,
        total: r.totalAmount,
      })
      if (r.errors.length > 0) {
        toast.warning(`Создано ${r.rentCreated} начислений. ${r.errors.length} ошибок — см. лог.`)
        console.warn("[batch billing errors]", r.errors)
      } else if (r.rentCreated === 0 && r.skipped > 0) {
        toast.info(`За ${period} все арендаторы уже имеют начисления (${r.skipped} пропущено)`)
      } else {
        toast.success(`Создано ${r.rentCreated} начислений на ${r.totalAmount.toLocaleString("ru-RU")} ₸`)
      }
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 hover:bg-purple-100 dark:hover:bg-purple-500/20 text-purple-700 dark:text-purple-300 px-3 py-1.5 text-xs font-medium"
      >
        <Zap className="h-3.5 w-3.5" />
        Сгенерировать начисления за месяц
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-purple-200 dark:border-purple-500/30 bg-white dark:bg-slate-900 p-4 space-y-3 max-w-md">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Массовое начисление</p>
        <button onClick={() => { setOpen(false); setResult(null) }} className="text-xs text-slate-400 hover:text-slate-600">×</button>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Создаст начисления RENT (и CLEANING для арендаторов с включённой уборкой) за указанный период.
        Уже созданные пропускаются.
      </p>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Период *</label>
        <input
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm font-mono focus:border-purple-500 focus:outline-none"
        />
      </div>
      {result && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 p-3 text-xs space-y-0.5">
          <p className="font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
            <Check className="h-3 w-3" /> Готово за {period}
          </p>
          <p className="text-emerald-800 dark:text-emerald-200">Аренда: <b>{result.rent}</b> начислений</p>
          {result.cleaning > 0 && <p className="text-emerald-800 dark:text-emerald-200">Уборка: <b>{result.cleaning}</b></p>}
          {result.skipped > 0 && <p className="text-emerald-700 dark:text-emerald-300">Пропущено (уже было): {result.skipped}</p>}
          <p className="text-emerald-900 dark:text-emerald-200 pt-1 border-t border-emerald-200 dark:border-emerald-500/30 mt-1.5">
            Σ: <b className="tabular-nums">{result.total.toLocaleString("ru-RU")} ₸</b>
          </p>
        </div>
      )}
      <button
        onClick={run}
        disabled={pending}
        className="w-full rounded-lg bg-purple-600 hover:bg-purple-700 text-white py-2 text-sm font-medium disabled:opacity-60"
      >
        {pending ? "Генерация..." : "Запустить"}
      </button>
      <p className="text-[10px] text-slate-400 dark:text-slate-500">
        Также автоматически запускается 1-го числа каждого месяца через cron.
      </p>
    </div>
  )
}
