"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useTransition, useState, useEffect } from "react"
import { Search } from "lucide-react"

const TYPES = [
  { value: "ALL", label: "Все" },
  { value: "CONTRACT", label: "Договоры" },
  { value: "INVOICE", label: "Счета" },
  { value: "ACT", label: "Акты услуг" },
  { value: "RECONCILIATION", label: "Акты сверки" },
  { value: "HANDOVER", label: "Приём-передача" },
]

export function DocumentTypeFilter({
  currentType, currentSearch, currentPeriod,
}: {
  currentType: string
  currentSearch: string
  currentPeriod?: string
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [q, setQ] = useState(currentSearch)
  const [period, setPeriod] = useState(currentPeriod ?? "")

  // Debounced search
  useEffect(() => {
    if (q === currentSearch) return
    const timer = setTimeout(() => {
      const sp = new URLSearchParams(params.toString())
      if (q) sp.set("q", q)
      else sp.delete("q")
      startTransition(() => router.push(`?${sp.toString()}`))
    }, 350)
    return () => clearTimeout(timer)
  }, [q, currentSearch, params, router])

  function setType(type: string) {
    const sp = new URLSearchParams(params.toString())
    if (type === "ALL") sp.delete("type")
    else sp.set("type", type)
    startTransition(() => router.push(`?${sp.toString()}`))
  }

  function setPeriodValue(value: string) {
    setPeriod(value)
    const sp = new URLSearchParams(params.toString())
    if (value) sp.set("period", value)
    else sp.delete("period")
    startTransition(() => router.push(`?${sp.toString()}`))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setType(t.value)}
            disabled={pending}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              currentType === t.value
                ? "bg-slate-900 text-white"
                : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по контрагенту или номеру..."
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <input
          type="month"
          value={period}
          onChange={(e) => setPeriodValue(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        {(q || period) && (
          <button
            onClick={() => {
              setQ("")
              setPeriod("")
              startTransition(() => router.push(window.location.pathname + (currentType !== "ALL" ? `?type=${currentType}` : "")))
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Сбросить
          </button>
        )}
      </div>
    </div>
  )
}
