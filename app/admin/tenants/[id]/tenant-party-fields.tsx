"use client"

// Поля стороны-арендатора, зависящие от правовой формы. Для ФИЗЛИЦА
// (PHYSICAL) арендатор выступает от своего имени: нет «руководителя»,
// «должности» и «действует на основании»; «название» → «ФИО», «юр. адрес» →
// «адрес проживания», основание — удостоверение личности (поля в
// TenantIdentityFields). Для юрлиц/ИП — прежний набор.

import { useState } from "react"
import { AddressAutocompleteInput } from "@/components/forms/address-autocomplete-input"
import { TenantIdentityFields } from "../tenant-identity-fields"
import { normalizeTenantLegalType, type TenantLegalType } from "@/lib/tenant-identity"

const inputCls = "w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
const labelCls = "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"

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
}

export function TenantPartyFields({ tenant }: { tenant: PartyTenant }) {
  const [legalType, setLegalType] = useState<TenantLegalType>(normalizeTenantLegalType(tenant.legalType))
  const isPhysical = legalType === "PHYSICAL"

  return (
    <>
      <div>
        <label className={labelCls}>{isPhysical ? "ФИО арендатора" : "Название компании"}</label>
        <input
          name="companyName"
          defaultValue={tenant.companyName}
          required
          placeholder={isPhysical ? "Иванов Иван Иванович" : "ТОО «Название» / ИП ФИО"}
          className={inputCls}
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
        onLegalTypeChange={setLegalType}
      />

      <div className="col-span-2">
        <label className={labelCls}>{isPhysical ? "Адрес проживания" : "Юридический адрес"}</label>
        <AddressAutocompleteInput
          name="legalAddress"
          defaultValue={tenant.legalAddress ?? ""}
          includeStructuredFields={false}
          placeholder={isPhysical ? "г. Усть-Каменогорск, ул. …, дом …, кв. …" : "г. Усть-Каменогорск, ул..."}
          className={inputCls}
        />
      </div>

      {!isPhysical && (
        <div className="col-span-2">
          <label className={labelCls}>Фактический адрес</label>
          <AddressAutocompleteInput
            name="actualAddress"
            defaultValue={tenant.actualAddress ?? ""}
            includeStructuredFields={false}
            placeholder="Если совпадает с юридическим — оставьте пустым"
            className={inputCls}
          />
        </div>
      )}

      {!isPhysical && (
        <>
          <div>
            <label className={labelCls}>ФИО руководителя</label>
            <input name="directorName" defaultValue={tenant.directorName ?? ""} placeholder="Иванов Иван Иванович" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Должность руководителя</label>
            <input name="directorPosition" defaultValue={tenant.directorPosition ?? ""} placeholder="Директор / Учредитель" className={inputCls} />
          </div>
          <div className="col-span-full">
            <label className={labelCls}>Действует на основании</label>
            <input
              name="basisDocument"
              defaultValue={tenant.basisDocument ?? ""}
              placeholder="ИП: Талона №… от … / ТОО: Устава / ЧСИ: лицензии №…"
              className={inputCls}
            />
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              Подставится в шапке договора: «…действующий <span className="font-mono">на основании [текст]</span>».
              ИП — Талона, ТОО — Устава, ЧСИ — лицензии. Если пусто — фраза по форме собственности.
            </p>
          </div>
        </>
      )}
    </>
  )
}
