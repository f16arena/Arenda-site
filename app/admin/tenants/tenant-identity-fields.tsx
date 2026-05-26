"use client"

import { useState } from "react"
import { formatKzIinBirthDate, validateKazakhstanIin } from "@/lib/kz-iin"
import {
  normalizeTenantLegalType,
  tenantLegalTypeUsesBin,
  tenantTaxIdLabel,
  tenantTaxIdValue,
  type TenantLegalType,
} from "@/lib/tenant-identity"

type Props = {
  initialLegalType?: string | null
  initialBin?: string | null
  initialIin?: string | null
}

export function TenantIdentityFields({ initialLegalType, initialBin, initialIin }: Props) {
  const [legalType, setLegalType] = useState<TenantLegalType>(normalizeTenantLegalType(initialLegalType))
  const [taxId, setTaxId] = useState(() =>
    tenantTaxIdValue({ legalType: initialLegalType, bin: initialBin, iin: initialIin }),
  )
  const usesBin = tenantLegalTypeUsesBin(legalType)
  const taxIdLabel = tenantTaxIdLabel(legalType)
  const iinValidation = !usesBin && taxId.length === 12 ? validateKazakhstanIin(taxId) : null

  return (
    <>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          Правовая форма
        </label>
        <select
          name="legalType"
          value={legalType}
          onChange={(event) => {
            setLegalType(normalizeTenantLegalType(event.target.value))
            setTaxId("")
          }}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900"
        >
          <option value="IP">ИП — Талон (Уведомление о начале деятельности)</option>
          <option value="TOO">ТОО — Устав</option>
          <option value="AO">АО — Устав</option>
          <option value="CHSI">ЧСИ — Лицензия МЮ</option>
          <option value="ADVOKAT">Адвокат — Лицензия МЮ</option>
          <option value="NOTARIUS">Нотариус — Лицензия МЮ</option>
          <option value="PHYSICAL">Физ. лицо — Удостоверение личности</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          {taxIdLabel} <span className="text-slate-300 dark:text-slate-600">12 цифр</span>
        </label>
        <input
          name={usesBin ? "bin" : "iin"}
          value={taxId}
          onChange={(event) => setTaxId(event.target.value.replace(/\D/g, "").slice(0, 12))}
          placeholder={
            usesBin
              ? "БИН для ТОО/АО"
              : legalType === "CHSI"
                ? "ИИН частного судебного исполнителя"
                : legalType === "ADVOKAT"
                  ? "ИИН адвоката"
                  : legalType === "NOTARIUS"
                    ? "ИИН нотариуса"
                    : "ИИН для ИП/физлица"
          }
          inputMode="numeric"
          pattern="\d{12}"
          maxLength={12}
          className={[
            "w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2",
            iinValidation && !iinValidation.ok
              ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
              : "border-slate-200 dark:border-slate-800 focus:border-blue-500 focus:ring-blue-500/20",
          ].join(" ")}
        />
        {!iinValidation && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">12 цифр без пробелов</p>
        )}
        {iinValidation && (
          <p className={[
            "mt-1 text-[11px]",
            iinValidation.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
          ].join(" ")}>
            {iinValidation.ok
              ? iinValidation.birthDate
                ? `Контрольная цифра верна · ${formatKzIinBirthDate(iinValidation.birthDate)} · ${iinValidation.genderLabel ?? "пол не определён"}`
                : "Контрольная цифра верна · дата/пол не расшифрованы по классическому формату"
              : iinValidation.errors[0]}
          </p>
        )}
        <input type="hidden" name={usesBin ? "iin" : "bin"} value="" />
      </div>
    </>
  )
}
