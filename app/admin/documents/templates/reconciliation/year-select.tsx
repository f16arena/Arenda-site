"use client"

import { useRouter, useSearchParams } from "next/navigation"

export function ReconciliationYearSelect({
  value,
  years,
}: {
  value: number
  years: number[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function changeYear(nextYear: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("year", nextYear)
    const query = params.toString()
    router.push(`/admin/documents/new/reconciliation${query ? `?${query}` : ""}`)
  }

  return (
    <select
      value={value}
      onChange={(event) => changeYear(event.target.value)}
      className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm bg-white dark:bg-slate-900"
    >
      {years.map((year) => (
        <option key={year} value={year}>{year}</option>
      ))}
    </select>
  )
}
