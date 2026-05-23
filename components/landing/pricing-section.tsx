"use client"

import { useState } from "react"
import { Check, Sparkles } from "lucide-react"
import type { PricingPlan, PricingPeriod, PricingMatrix } from "./pricing-data"

function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₸"
}

/**
 * Сетка тарифов лендинга: переключатель периодов + 5 карточек с ценами.
 * Получает заранее посчитанную матрицу с сервера (см. pricing-data.ts).
 */
export function PricingSection({
  plans,
  periods,
  matrix,
  foundingActive,
}: {
  plans: PricingPlan[]
  periods: PricingPeriod[]
  matrix: PricingMatrix
  foundingActive: boolean
}) {
  const [periodCode, setPeriodCode] = useState(periods.find((p) => p.code === "yearly")?.code ?? periods[0]?.code ?? "monthly")
  const [showFounders, setShowFounders] = useState(false)
  const period = periods.find((p) => p.code === periodCode)

  return (
    <div className="space-y-6">
      {/* Переключатели */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {periods.map((p) => (
            <button
              key={p.code}
              onClick={() => setPeriodCode(p.code)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                p.code === periodCode
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {p.name}
              {p.discountPct > 0 && (
                <span className={`ml-1.5 text-[10px] font-semibold ${p.code === periodCode ? "text-amber-300" : "text-emerald-600"}`}>
                  −{p.discountPct}%
                </span>
              )}
            </button>
          ))}
        </div>
        {foundingActive && (
          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={showFounders} onChange={(e) => setShowFounders(e.target.checked)} />
            <Sparkles className="h-4 w-4 text-amber-500" />
            <span>Founding Pricing (−40% lifetime для первых 15)</span>
          </label>
        )}
      </div>

      {period?.bonusMessage && (
        <p className="text-center text-sm font-medium text-emerald-700">
          🎁 {period.bonusMessage}
        </p>
      )}

      {/* Карточки */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {plans.map((plan) => {
          const cell = matrix[plan.code]?.[periodCode]
          const breakdown = cell ? (showFounders ? cell.founders : cell.normal) : null
          const isFree = plan.code === "FREE"
          const isPro = plan.code === "PRO"

          return (
            <div
              key={plan.code}
              className={`relative rounded-2xl border bg-white p-5 shadow-sm transition-all ${
                isPro
                  ? "border-blue-500 ring-2 ring-blue-100 lg:scale-[1.03]"
                  : "border-slate-200"
              }`}
            >
              {isPro && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                  Выбор большинства
                </div>
              )}
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{plan.name}</p>
              <p className="mt-1 min-h-[36px] text-xs text-slate-500">{plan.description ?? ""}</p>

              <div className="mt-4">
                {isFree ? (
                  <>
                    <p className="text-3xl font-bold text-slate-900">0 ₸</p>
                    <p className="mt-1 text-xs text-slate-400">бессрочно</p>
                  </>
                ) : breakdown ? (
                  <>
                    <p className="text-3xl font-bold text-slate-900">
                      {fmt(breakdown.pricePerMonth)}
                      <span className="text-sm font-normal text-slate-400">/мес</span>
                    </p>
                    {breakdown.monthsCount > 1 && (
                      <p className="mt-1 text-xs text-slate-500">
                        Итого: {fmt(breakdown.totalPriceFinal)} за {breakdown.monthsCount} мес
                      </p>
                    )}
                    {breakdown.appliedDiscountPct > 0 && (
                      <p className="mt-0.5 text-[11px] font-medium text-emerald-600">
                        Скидка {breakdown.appliedDiscountPct}% · экономия {fmt(breakdown.savings)}
                      </p>
                    )}
                    {showFounders && breakdown.foundersDiscountPct > 0 && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
                        <Sparkles className="h-3 w-3" /> Founding lifetime
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xl font-bold text-slate-900">По запросу</p>
                )}
              </div>

              <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-4 text-xs text-slate-700">
                <p>
                  <b>{plan.maxBuildings ?? "∞"}</b> зданий ·
                  <b className="ml-1">{plan.maxTenants ?? "∞"}</b> арендаторов
                </p>
                <p>
                  <b>{plan.maxUsers ?? "∞"}</b> пользователей ·
                  <b className="ml-1">{plan.maxStorageGb ?? "∞"}</b> ГБ хранилища
                </p>
              </div>

              {plan.highlights.length > 0 && (
                <ul className="mt-4 space-y-1.5 text-xs text-slate-600">
                  {plan.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              )}

              <a
                href="/signup"
                className={`mt-5 block rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors ${
                  isPro
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {isFree ? "Начать бесплатно" : plan.code === "ENTERPRISE" ? "Связаться" : "Выбрать тариф"}
              </a>
            </div>
          )
        })}
      </div>
    </div>
  )
}
