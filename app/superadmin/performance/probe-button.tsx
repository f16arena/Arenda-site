"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react"
import { probePages, type ProbeResult } from "@/app/actions/perf-probe"

export function ProbePagesButton() {
  const [pending, startTransition] = useTransition()
  const [results, setResults] = useState<ProbeResult[] | null>(null)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)

  function run() {
    startTransition(async () => {
      try {
        const r = await probePages()
        setResults(r.results)
        setCheckedAt(r.checkedAt)
        const bad = r.results.filter((x) => !x.ok).length
        if (bad > 0) toast.warning(`Проверка завершена: проблемных страниц ${bad}`)
        else toast.success("Проверка завершена: все страницы отвечают")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось выполнить проверку")
      }
    })
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Активная проверка страниц</h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400">
            Сервер сам открывает ключевые страницы под вашей сессией и измеряет полное время ответа и статус. Удобно проверить скорость прямо сейчас, не дожидаясь визитов пользователей.
          </p>
        </div>
        <button
          onClick={run}
          disabled={pending}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
          {pending ? "Проверяю…" : "Перепроверить страницы"}
        </button>
      </div>

      {results && (
        <div className="mt-4">
          {checkedAt && (
            <p className="mb-2 text-[11px] text-slate-400 dark:text-slate-500">
              Проверено: {new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Qyzylorda" }).format(new Date(checkedAt))}
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950/70 dark:text-slate-500">
                <tr>
                  <th className="px-4 py-2">Страница</th>
                  <th className="px-4 py-2">Статус</th>
                  <th className="px-4 py-2">Время</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {results.map((r) => (
                  <tr key={r.path} className="text-slate-700 dark:text-slate-300">
                    <td className="px-4 py-2 font-mono text-xs">{r.path}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        r.ok
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                          : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                      }`}>
                        {r.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {r.status === 0 ? (r.note ?? "ошибка") : r.status}
                        {r.note && r.status !== 0 ? ` · ${r.note}` : ""}
                      </span>
                    </td>
                    <td className={`px-4 py-2 font-semibold ${durationClass(r.ms)}`}>{formatMs(r.ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

function formatMs(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} с`
  return `${value} мс`
}

function durationClass(ms: number) {
  if (ms >= 3000) return "text-red-600 dark:text-red-400"
  if (ms >= 1200) return "text-amber-600 dark:text-amber-400"
  return "text-emerald-600 dark:text-emerald-400"
}
