"use client"

import { useState } from "react"
import { Receipt } from "lucide-react"
import { ServerForm } from "@/components/ui/server-form"
import { updateOrganizationTax } from "@/app/actions/organization-settings"
import { getTaxRatePercent, getTaxRegime } from "@/lib/org-features"
import { Button } from "@/components/ui/button"

interface Props {
  organization: { id: string; features: string | null }
}

// Пресеты по новому Налоговому кодексу РК (с 01.01.2026).
const REGIME_PRESETS: { regime: string; rate: number; note: string }[] = [
  { regime: "Упрощёнка (СНР)", rate: 4, note: "4% с оборота; маслихат ±50% (2–6%)" },
  { regime: "Самозанятый", rate: 4, note: "4% соц. платежи, ИПН 0%" },
  { regime: "Крестьянское/фермерское", rate: 0.5, note: "0,5% с оборота" },
]

/** Ставка налога с оборота для отчёта владельца. */
export function TaxSettingsSection({ organization }: Props) {
  const [rate, setRate] = useState(getTaxRatePercent(organization.features))
  const [regime, setRegime] = useState(getTaxRegime(organization.features))

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
        <Receipt className="h-4 w-4 text-slate-400 dark:text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Налог (для отчёта владельца)</h2>
      </div>
      <ServerForm
        action={updateOrganizationTax.bind(null, organization.id)}
        successMessage="Налоговая ставка сохранена"
        className="p-5 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Режим (метка)</label>
            <input
              name="taxRegime"
              value={regime}
              onChange={(e) => setRegime(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Ставка с оборота, %</label>
            <input
              name="taxRatePercent"
              type="number"
              min={0}
              max={20}
              step={0.5}
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {REGIME_PRESETS.map((p) => (
            <button
              key={p.regime}
              type="button"
              onClick={() => { setRate(p.rate); setRegime(p.regime) }}
              className={`rounded-lg border px-3 py-1.5 text-left text-xs transition ${
                regime === p.regime && rate === p.rate
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300"
                  : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              <span className="font-medium">{p.regime} · {p.rate}%</span>
              <span className="block text-[11px] text-slate-400 dark:text-slate-500">{p.note}</span>
            </button>
          ))}
        </div>

        <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-800 dark:text-amber-200">
          По новому Налоговому кодексу РК (с 1 января 2026) ставка СНР на основе упрощённой
          декларации — <b>4%</b> с оборота; местный маслихат может корректировать её на ±50%
          (фактически <b>2–6%</b>). НДС повышен до 16%. Для общеустановленного режима налог
          считается с прибыли (ИПН 10% / КПН 20%) — здесь модель оценивает налог с оборота,
          поэтому для общего режима цифра будет ориентировочной.
        </div>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="sm">Сохранить</Button>
        </div>
      </ServerForm>
    </div>
  )
}
