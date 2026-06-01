"use client"

import { Building2, Info } from "lucide-react"
import { formatMoney } from "@/lib/utils"
import type { MarketComparison } from "@/lib/market"

export function MarketSection({ data }: { data: MarketComparison | null }) {
  if (!data) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Рынок аренды</h3>
        <p className="text-[12px] text-slate-400 dark:text-slate-500">
          Город здания не распознан для рыночных данных. Укажите город в адресе здания.
        </p>
      </section>
    )
  }

  const date = data.collectedAt ? new Date(data.collectedAt).toLocaleDateString("ru-RU") : null
  const maxMedian = Math.max(1, ...data.types.map((t) => t.perSqmMedian), data.ownerPerSqm ?? 0)
  // Общий ориентир для сравнения — «Свободное назначение», иначе первый тип.
  const benchmark = data.types.find((t) => t.propertyType === "FREE") ?? data.types[0] ?? null
  const diffPct = benchmark && data.ownerPerSqm
    ? Math.round(((data.ownerPerSqm - benchmark.perSqmMedian) / benchmark.perSqmMedian) * 100)
    : null

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Рынок аренды · {data.cityLabel}</h3>
        {date && <span className="text-[11px] text-slate-400 dark:text-slate-500">данные на {date}</span>}
      </div>

      {data.types.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-slate-400 dark:text-slate-500">
          Рыночные данные ещё не собраны. Сборщик на VPS пришлёт их при ближайшем запуске.
        </p>
      ) : (
        <>
          {/* Ставка владельца + сравнение */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <Building2 className="h-3.5 w-3.5" /> Ваша ставка: {data.ownerPerSqm ? `${formatMoney(data.ownerPerSqm)}/м²` : "—"}
            </span>
            {diffPct !== null && (
              <span className={`rounded-md px-2 py-1 text-xs font-medium ${diffPct >= 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"}`}>
                {diffPct >= 0 ? "+" : ""}{diffPct}% к рынку ({benchmark!.label.toLowerCase()})
              </span>
            )}
          </div>

          {/* Бары медиан по типам + маркер ставки владельца */}
          <div className="space-y-2.5">
            {data.types.map((t) => {
              const w = (t.perSqmMedian / maxMedian) * 100
              return (
                <div key={t.propertyType}>
                  <div className="mb-0.5 flex items-baseline justify-between text-[12px]">
                    <span className="text-slate-600 dark:text-slate-300">{t.label}</span>
                    <span className="tabular-nums font-medium text-slate-900 dark:text-slate-100">
                      {formatMoney(t.perSqmMedian)}/м²
                      <span className="ml-1.5 text-[10.5px] font-normal text-slate-400 dark:text-slate-500">n={t.sampleCount}</span>
                    </span>
                  </div>
                  <div className="relative h-3 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded bg-blue-500/70 dark:bg-blue-500/60" style={{ width: `${w}%` }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Маркер ставки владельца на той же шкале */}
          {data.ownerPerSqm && (
            <div className="relative mt-2 h-5">
              <div
                className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                style={{ left: `${Math.min(100, (data.ownerPerSqm / maxMedian) * 100)}%` }}
              >
                <div className="h-3 w-0.5 bg-slate-900 dark:bg-slate-100" />
                <span className="whitespace-nowrap text-[10px] font-medium text-slate-700 dark:text-slate-300">вы</span>
              </div>
            </div>
          )}

          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Медианы ₸/м² по объявлениям krisha (после отсева выбросов). Сравнивайте со своей ставкой по совпадающему типу помещений. Это ориентир, не оценка.
          </p>
        </>
      )}
    </section>
  )
}
