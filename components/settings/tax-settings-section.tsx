"use client"

import { useState } from "react"
import { Receipt } from "lucide-react"
import { ServerForm } from "@/components/ui/server-form"
import { CollapsibleCard } from "@/components/settings/collapsible-card"
import { updateOrganizationTax } from "@/app/actions/organization-settings"
import { getTaxRatePercent, getTaxRegime } from "@/lib/org-features"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/client"

interface Props {
  organization: { id: string; features: string | null }
}

// Пресеты по новому Налоговому кодексу РК (с 01.01.2026). Подписи режимов —
// из словаря: они же попадают в поле «Режим (метка)», которое читает отчёт.
const REGIME_PRESETS = [
  { key: "simplified", rate: 4 },
  { key: "selfEmployed", rate: 4 },
  { key: "farm", rate: 0.5 },
] as const

const PRESET_KEY = {
  simplified: { name: "common.settings.tax.presets.simplified", note: "common.settings.tax.presets.simplifiedNote" },
  selfEmployed: { name: "common.settings.tax.presets.selfEmployed", note: "common.settings.tax.presets.selfEmployedNote" },
  farm: { name: "common.settings.tax.presets.farm", note: "common.settings.tax.presets.farmNote" },
} as const

/** Ставка налога с оборота для отчёта владельца. */
export function TaxSettingsSection({ organization }: Props) {
  const { t } = useT()
  const [rate, setRate] = useState(getTaxRatePercent(organization.features))
  const [regime, setRegime] = useState(getTaxRegime(organization.features))

  return (
    <CollapsibleCard title={t("common.settings.tax.title")} icon={<Receipt className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />}>
      <ServerForm
        action={updateOrganizationTax.bind(null, organization.id)}
        successMessage={t("common.settings.tax.saved")}
        className="p-5 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("common.settings.tax.regime")}</label>
            <input
              name="taxRegime"
              value={regime}
              onChange={(e) => setRegime(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("common.settings.tax.rate")}</label>
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
          {REGIME_PRESETS.map((preset) => {
            const name = t(PRESET_KEY[preset.key].name)
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => { setRate(preset.rate); setRegime(name) }}
                className={`rounded-lg border px-3 py-1.5 text-left text-xs transition ${
                  regime === name && rate === preset.rate
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300"
                    : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <span className="font-medium">{name} · {preset.rate}%</span>
                <span className="block text-[11px] text-slate-400 dark:text-slate-500">{t(PRESET_KEY[preset.key].note)}</span>
              </button>
            )
          })}
        </div>

        <div
          className="rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-800 dark:text-amber-200"
          dangerouslySetInnerHTML={{ __html: t("common.settings.tax.note") }}
        />

        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="sm">{t("common.actions.save")}</Button>
        </div>
      </ServerForm>
    </CollapsibleCard>
  )
}
