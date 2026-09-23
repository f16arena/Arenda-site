import { Landmark } from "lucide-react"

import { updateOrganizationRequisites } from "@/app/actions/organization-settings"
import { AddressAutocompleteInput } from "@/components/forms/address-autocomplete-input"
import { AsciiEmailInput, KzPhoneInput } from "@/components/forms/contact-inputs"
import { CollapsibleCard } from "@/components/settings/collapsible-card"
import { OrganizationBankFields } from "@/components/settings/organization-bank-fields"
import { OrganizationIdentityFields } from "@/components/settings/organization-identity-fields"
import { ServerForm } from "@/components/ui/server-form"
import { Button } from "@/components/ui/button"
import { getT } from "@/lib/i18n/server"

type OrganizationRequisitesFormData = {
  id: string
  name: string
  legalType: string | null
  legalName: string | null
  shortName: string | null
  bin: string | null
  iin: string | null
  directorName: string | null
  directorPosition: string | null
  basis: string | null
  legalAddress: string | null
  actualAddress: string | null
  bankName: string | null
  iik: string | null
  bik: string | null
  secondBankName: string | null
  secondIik: string | null
  secondBik: string | null
  kbe: string | null
  knp: string | null
  phone: string | null
  email: string | null
  // Дефолт пени для договоров (применяется когда у tenant.penaltyPercent === 0).
  defaultPenaltyPercent?: number | null
}

export async function OrganizationRequisitesSection({ organization }: { organization: OrganizationRequisitesFormData }) {
  const { t } = await getT()
  const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
  const labelClass = "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"

  return (
    <CollapsibleCard
      title={t("common.settings.requisites.title")}
      icon={<Landmark className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />}
      headerRight={t("common.settings.requisites.headerRight")}
    >
      <ServerForm
        action={updateOrganizationRequisites.bind(null, organization.id)}
        successMessage={t("common.settings.requisites.saved")}
        className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2"
      >
        <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100 lg:col-span-2">
          {t("common.settings.requisites.intro")}{" "}
          <a href="/admin/profile" className="font-medium underline">{t("common.settings.requisites.myProfile")}</a>.
        </div>

        <OrganizationIdentityFields
          legalType={organization.legalType}
          bin={organization.bin}
          iin={organization.iin}
          inputClass={inputClass}
          labelClass={labelClass}
        />

        <div>
          <label className={labelClass}>{t("common.settings.requisites.shortName")}</label>
          <input
            name="shortName"
            defaultValue={organization.shortName ?? organization.name}
            className={inputClass}
            placeholder={t("common.settings.requisites.shortNamePlaceholder")}
          />
        </div>

        <div className="lg:col-span-2">
          <label className={labelClass}>{t("common.settings.requisites.legalName")}</label>
          <input
            name="legalName"
            defaultValue={organization.legalName ?? organization.name}
            required
            className={inputClass}
            placeholder={t("common.settings.requisites.legalNamePlaceholder")}
          />
        </div>

        <div>
          <label className={labelClass}>{t("common.settings.requisites.directorName")}</label>
          <input
            name="directorName"
            defaultValue={organization.directorName ?? ""}
            required
            className={inputClass}
            placeholder={t("common.settings.requisites.directorNamePlaceholder")}
          />
        </div>
        <div>
          <label className={labelClass}>{t("common.settings.requisites.directorPosition")}</label>
          <input
            name="directorPosition"
            defaultValue={organization.directorPosition ?? ""}
            className={inputClass}
            placeholder={t("common.settings.requisites.directorPositionPlaceholder")}
          />
        </div>

        <div className="lg:col-span-2">
          <label className={labelClass}>{t("common.settings.requisites.basis")}</label>
          <input
            name="basis"
            defaultValue={organization.basis ?? ""}
            required
            className={inputClass}
            placeholder={t("common.settings.requisites.basisPlaceholder")}
          />
        </div>

        <div>
          <label className={labelClass}>{t("common.settings.requisites.legalAddress")}</label>
          <AddressAutocompleteInput
            name="legalAddress"
            defaultValue={organization.legalAddress ?? ""}
            required
            includeStructuredFields={false}
            className={inputClass}
            placeholder={t("common.settings.requisites.legalAddressPlaceholder")}
          />
        </div>
        <div>
          <label className={labelClass}>{t("common.settings.requisites.actualAddress")}</label>
          <AddressAutocompleteInput
            name="actualAddress"
            defaultValue={organization.actualAddress ?? ""}
            includeStructuredFields={false}
            className={inputClass}
            placeholder={t("common.settings.requisites.actualAddressPlaceholder")}
          />
        </div>

        <div id="payment-accounts" className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50 lg:col-span-2">
          <div className="mb-4">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("common.settings.requisites.accounts")}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t("common.settings.requisites.accountsHint")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("common.settings.requisites.mainAccount")}</p>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  {t("common.settings.requisites.mainAccountHint")}
                </span>
              </div>
              <OrganizationBankFields
                bankNameName="bankName"
                bikName="bik"
                iikName="iik"
                defaultBankName={organization.bankName}
                defaultBik={organization.bik}
                defaultIik={organization.iik}
                labelClass={labelClass}
                inputClass={inputClass}
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("common.settings.requisites.extraAccount")}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {t("common.settings.requisites.extraAccountHint")}
                </span>
              </div>
              <OrganizationBankFields
                bankNameName="secondBankName"
                bikName="secondBik"
                iikName="secondIik"
                defaultBankName={organization.secondBankName}
                defaultBik={organization.secondBik}
                defaultIik={organization.secondIik}
                labelClass={labelClass}
                inputClass={inputClass}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>{t("common.settings.requisites.kbe")}</label>
              <input name="kbe" defaultValue={organization.kbe ?? ""} placeholder={t("common.settings.requisites.kbePlaceholder")} maxLength={2} className={inputClass} />
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{t("common.settings.requisites.kbeHint")}</p>
            </div>
            <div>
              <label className={labelClass}>{t("common.settings.requisites.knp")}</label>
              <input name="knp" defaultValue={organization.knp ?? ""} placeholder={t("common.settings.requisites.knpPlaceholder")} maxLength={3} className={inputClass} />
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{t("common.settings.requisites.knpHint")}</p>
            </div>
          </div>
        </div>

        <div>
          <label className={labelClass}>{t("common.settings.requisites.orgPhone")}</label>
          <KzPhoneInput name="phone" defaultValue={organization.phone ?? ""} className={inputClass} />
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{t("common.settings.requisites.orgPhoneHint")}</p>
        </div>
        <div>
          <label className={labelClass}>{t("common.settings.requisites.orgEmail")}</label>
          <AsciiEmailInput name="email" defaultValue={organization.email ?? ""} className={inputClass} />
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{t("common.settings.requisites.orgEmailHint")}</p>
        </div>

        {/* Дефолт пени по договорам. Применяется когда у конкретного арендатора
            penaltyPercent = 0 («использовать дефолт»). 0.5 — стандартная зеркальная
            пеня в РК (см. аудит 2026-05-26 #12-13). */}
        <div className="lg:col-span-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("common.settings.requisites.defaults")}
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>{t("common.settings.requisites.penaltyPercent")}</label>
              <input
                name="defaultPenaltyPercent"
                type="number"
                step="0.1"
                min="0"
                max="10"
                defaultValue={organization.defaultPenaltyPercent ?? 0.5}
                className={inputClass}
                placeholder="0.5"
              />
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                {t("common.settings.requisites.penaltyHint")}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-end justify-end lg:col-span-2">
          <Button
            type="submit"
            size="lg"
            className="font-medium"
          >
            {t("common.settings.requisites.submit")}
          </Button>
        </div>
      </ServerForm>
    </CollapsibleCard>
  )
}
