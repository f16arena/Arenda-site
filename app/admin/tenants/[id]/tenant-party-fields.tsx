"use client"

import { FIELD_CLS, LABEL_CLS } from "@/lib/ui-fields"
// Поля стороны-арендатора, зависящие от правовой формы. Для ФИЗЛИЦА
// (PHYSICAL) арендатор выступает от своего имени: нет «руководителя»,
// «должности» и «действует на основании»; «название» → «ФИО», «юр. адрес» →
// «адрес проживания», основание — удостоверение личности (поля в
// TenantIdentityFields). Для юрлиц/ИП — прежний набор.

import { useState } from "react"
import { AddressAutocompleteInput } from "@/components/forms/address-autocomplete-input"
import { Input } from "@/components/ui/input"
import { TenantIdentityFields } from "../tenant-identity-fields"
import { normalizeTenantLegalType, type TenantLegalType } from "@/lib/tenant-identity"
import { useT } from "@/lib/i18n/client"

const inputCls = FIELD_CLS
const labelCls = LABEL_CLS

export type PartyTenant = {
  companyName: string
  legalType: string
  bin: string | null
  iin: string | null
  legalAddress: string | null
  actualAddress: string | null
  directorName: string | null
  directorPosition: string | null
  basisDocument: string | null
  idDocNumber: string | null
  idDocIssuedBy: string | null
  idDocIssuedAt: string | null
  idDocExpiresAt: string | null
  isVatPayer: boolean
  vatStatus: string | null
}

export function TenantPartyFields({ tenant }: { tenant: PartyTenant }) {
  const { t } = useT()
  const [legalType, setLegalType] = useState<TenantLegalType>(normalizeTenantLegalType(tenant.legalType))
  const isPhysical = legalType === "PHYSICAL"

  return (
    <>
      <div>
        <label className={labelCls}>
          {isPhysical ? t("adminTenants.party.personName") : t("adminTenants.party.companyName")}
        </label>
        <Input
          name="companyName"
          defaultValue={tenant.companyName}
          required
          placeholder={isPhysical
            ? t("adminTenants.party.personNamePlaceholder")
            : t("adminTenants.party.companyNamePlaceholder")}
        />
      </div>

      <TenantIdentityFields
        initialLegalType={tenant.legalType}
        initialBin={tenant.bin}
        initialIin={tenant.iin}
        initialIdDocNumber={tenant.idDocNumber}
        initialIdDocIssuedBy={tenant.idDocIssuedBy}
        initialIdDocIssuedAt={tenant.idDocIssuedAt}
        initialIdDocExpiresAt={tenant.idDocExpiresAt}
        initialIsVatPayer={tenant.isVatPayer}
        initialVatStatus={tenant.vatStatus}
        onLegalTypeChange={setLegalType}
      />

      <div className="col-span-2">
        <label className={labelCls}>
          {isPhysical ? t("adminTenants.party.livingAddress") : t("adminTenants.party.legalAddress")}
        </label>
        <AddressAutocompleteInput
          name="legalAddress"
          defaultValue={tenant.legalAddress ?? ""}
          includeStructuredFields={false}
          placeholder={isPhysical
            ? t("adminTenants.party.livingAddressPlaceholder")
            : t("adminTenants.party.legalAddressPlaceholder")}
          className={inputCls}
        />
      </div>

      {!isPhysical && (
        <div className="col-span-2">
          <label className={labelCls}>{t("adminTenants.party.actualAddress")}</label>
          <AddressAutocompleteInput
            name="actualAddress"
            defaultValue={tenant.actualAddress ?? ""}
            includeStructuredFields={false}
            placeholder={t("adminTenants.party.actualAddressPlaceholder")}
            className={inputCls}
          />
        </div>
      )}

      {!isPhysical && (
        <>
          <div>
            <label className={labelCls}>{t("adminTenants.party.directorName")}</label>
            <Input name="directorName" defaultValue={tenant.directorName ?? ""} placeholder={t("adminTenants.party.directorNamePlaceholder")} />
          </div>
          <div>
            <label className={labelCls}>{t("adminTenants.party.directorPosition")}</label>
            <Input name="directorPosition" defaultValue={tenant.directorPosition ?? ""} placeholder={t("adminTenants.party.directorPositionPlaceholder")} />
          </div>
          <div className="col-span-full">
            <label className={labelCls}>{t("adminTenants.party.basis")}</label>
            <Input
              name="basisDocument"
              defaultValue={tenant.basisDocument ?? ""}
              placeholder={t("adminTenants.party.basisPlaceholder")}
            />
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              {t("adminTenants.party.basisHint")}
            </p>
          </div>
        </>
      )}
    </>
  )
}
