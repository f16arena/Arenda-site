import { Receipt } from "lucide-react"
import { ServerForm } from "@/components/ui/server-form"
import { CollapsibleCard } from "@/components/settings/collapsible-card"
import { updateOrganizationVat } from "@/app/actions/organization-settings"
import { coerceKzVatRate, DEFAULT_KZ_VAT_RATE, KZ_VAT_RATE_OPTIONS } from "@/lib/kz-vat"
import { Button } from "@/components/ui/button"
import { getT } from "@/lib/i18n/server"

interface Props {
  organization: {
    id: string
    isVatPayer: boolean
    vatRate: number
    vatNumber: string | null
  }
}

// Числа ставок живут в lib/kz-vat (их читает и биллинг), подписи — в словаре.
const RATE_LABEL_KEY = {
  16: "common.settings.vat.rateOption.r16",
  10: "common.settings.vat.rateOption.r10",
  5: "common.settings.vat.rateOption.r5",
  0: "common.settings.vat.rateOption.r0",
} as const

export async function VatSection({ organization }: Props) {
  const { t } = await getT()
  const selectedRate = coerceKzVatRate(organization.vatRate, DEFAULT_KZ_VAT_RATE)

  return (
    <CollapsibleCard title={t("common.settings.vat.title")} icon={<Receipt className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />}>
      <ServerForm
        action={updateOrganizationVat.bind(null, organization.id)}
        successMessage={t("common.settings.vat.saved")}
        className="p-5 space-y-4"
      >
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="isVatPayer"
            defaultChecked={organization.isVatPayer}
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{t("common.settings.vat.payer")}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t("common.settings.vat.payerHint")}
            </p>
          </div>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("common.settings.vat.rate")}</label>
            <select
              name="vatRate"
              defaultValue={String(selectedRate)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              {KZ_VAT_RATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(RATE_LABEL_KEY[option.value])}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
              {t("common.settings.vat.rateHint")}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("common.settings.vat.series")}</label>
            <input
              name="vatNumber"
              defaultValue={organization.vatNumber ?? ""}
              placeholder="60001 17 0000 ..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">{t("common.settings.vat.seriesHint")}</p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            size="lg"
            className="font-medium"
          >
            {t("common.actions.save")}
          </Button>
        </div>

        <div className="text-[11px] text-slate-500 dark:text-slate-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg p-3">
          <b className="text-amber-800 dark:text-amber-200">{t("common.settings.vat.importantTitle")}</b>
          {t("common.settings.vat.important1")}
          <b>{t("common.settings.vat.important2")}</b>
          {t("common.settings.vat.important3")}
          <a href="https://esf.gov.kz/" target="_blank" rel="noopener" className="underline text-amber-700 dark:text-amber-300">esf.gov.kz</a>.
          {t("common.settings.vat.important4")}
          <i>{t("common.settings.vat.important5")}</i>
          {t("common.settings.vat.important6")}
          <i>{t("common.settings.vat.important7")}</i>
          {t("common.settings.vat.important8")}
        </div>
      </ServerForm>
    </CollapsibleCard>
  )
}
