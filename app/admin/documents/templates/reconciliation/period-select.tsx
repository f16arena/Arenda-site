"use client"

import { useRouter, useSearchParams } from "next/navigation"

export function ReconciliationPeriodSelect({ from, to }: { from: string; to: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function change(next: { from?: string; to?: string }) {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("year") // переходим на диапазон
    if (next.from) params.set("from", next.from)
    if (next.to) params.set("to", next.to)
    router.push(`/admin/documents/new/reconciliation?${params.toString()}`)
  }

  const inputClass = "rounded-lg border border-slate-200 dark:border-slate-800 px-2 py-2 text-sm bg-white dark:bg-slate-900"

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-slate-500 dark:text-slate-400">с</span>
      <input type="month" value={from} max={to} onChange={(e) => change({ from: e.target.value })} className={inputClass} />
      <span className="text-xs text-slate-500 dark:text-slate-400">по</span>
      <input type="month" value={to} min={from} onChange={(e) => change({ to: e.target.value })} className={inputClass} />
    </div>
  )
}
