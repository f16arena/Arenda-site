"use client"

import { useState } from "react"
import { Building2, Info, TrendingUp, TrendingDown, Minus } from "lucide-react"
import { formatMoney } from "@/lib/utils"
import type { MarketComparison } from "@/lib/market"

export function MarketSection({ data }: { data: MarketComparison | null }) {
  const [scopeKey, setScopeKey] = useState<string>("city")

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
  const scope = data.scopes.find((s) => s.key === scopeKey) ?? data.scopes[0] ?? null
  const maxMedian = Math.max(1, ...(scope?.types.map((t) => t.perSqmMedian) ?? [1]), data.ownerPerSqm ?? 0)
  const benchmark = scope?.types.find((t) => t.propertyType === "FREE") ?? scope?.types[0] ?? null
  const diffPct = benchmark && data.ownerPerSqm
    ? Math.round(((data.ownerPerSqm - benchmark.perSqmMedian) / benchmark.perSqmMedian) * 100)
    : null

  // Вердикт-советник
  const verdict = diffPct === null ? null
    : diffPct <= -12 ? { tone: "low", icon: TrendingDown, text: `Вы сдаёте дешевле рынка на ${Math.abs(diffPct)}% — есть запас поднять ставку`, cls: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200" }
    : diffPct >= 12 ? { tone: "high", icon: TrendingUp, text: `Ваша ставка выше рынка на ${diffPct}% — возможно, завышена для этой локации`, cls: "bg-blue-50 text-blue-800 dark:bg-blue-500/10 dark:text-blue-200" }
    : { tone: "fair", icon: Minus, text: `Ваша ставка в рынке (${diffPct >= 0 ? "+" : ""}${diffPct}% к медиане)`, cls: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200" }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Рынок аренды · сколько просят рядом</h3>
        {date && <span className="text-[11px] text-slate-400 dark:text-slate-500">данные на {date}</span>}
      </div>

      {data.scopes.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-slate-400 dark:text-slate-500">
          Рыночные данные ещё не собраны. Сборщик на VPS пришлёт их при ближайшем запуске.
        </p>
      ) : (
        <>
          {/* Область сравнения: район ↔ город (расширяемая) */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="text-[12px] text-slate-500 dark:text-slate-400">Область:</label>
            <select
              value={scope?.key ?? "city"}
              onChange={(e) => setScopeKey(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            >
              {data.scopes.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.isCity ? s.label : `Район: ${s.label}`}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-slate-400 dark:text-slate-500">сузьте до района или расширьте до города</span>
          </div>

          {/* Вердикт-советник */}
          {verdict && (
            <div className={`mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[12.5px] ${verdict.cls}`}>
              <verdict.icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <b>Ваша ставка: {data.ownerPerSqm ? `${formatMoney(data.ownerPerSqm)}/м²` : "—"}.</b> {verdict.text}.
              </span>
            </div>
          )}

          {/* Бары медиан по типам */}
          <div className="space-y-2.5">
            {scope?.types.map((t) => {
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
          {data.ownerPerSqm && (scope?.types.length ?? 0) > 0 && (
            <div className="relative mt-2 h-5">
              <div
                className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                style={{ left: `${Math.min(100, (data.ownerPerSqm / maxMedian) * 100)}%` }}
              >
                <div className="h-3 w-0.5 bg-slate-900 dark:bg-slate-100" />
                <span className="whitespace-nowrap text-[10px] font-medium text-slate-700 dark:text-slate-300">
                  вы · {formatMoney(data.ownerPerSqm)}
                </span>
              </div>
            </div>
          )}

          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            <Building2 className="mt-0.5 h-3 w-3 shrink-0" />
            Сравнивайте со своей ставкой по совпадающему типу помещений. «Вы» — ваша средняя ₸/м² (Σ аренды ÷ Σ площади).
          </p>
          <p className="mt-1 flex items-start gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Медианы по объявлениям krisha (после отсева выбросов). Ориентир для решения, не оценка.
          </p>
        </>
      )}
    </section>
  )
}
