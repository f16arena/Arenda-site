"use client"

import { useId, useMemo, useState } from "react"
import { AlertTriangle, Check } from "lucide-react"

import { validateRequisites } from "@/lib/kz-validators"
import { findBankByBik, findBankByName, findSingleBankSuggestion, isKnownBankName, KZ_BANKS } from "@/lib/kz-banks"

type OrganizationBankFieldsProps = {
  bankNameName: string
  bikName: string
  iikName: string
  defaultBankName?: string | null
  defaultBik?: string | null
  defaultIik?: string | null
  labelClass: string
  inputClass: string
}

export function OrganizationBankFields({
  bankNameName,
  bikName,
  iikName,
  defaultBankName,
  defaultBik,
  defaultIik,
  labelClass,
  inputClass,
}: OrganizationBankFieldsProps) {
  const bikListId = useId()
  const bankNameListId = useId()
  const [bankName, setBankName] = useState(defaultBankName ?? "")
  const [bik, setBik] = useState(normalizeBik(defaultBik ?? ""))
  const [iik, setIik] = useState(normalizeIikInput(defaultIik ?? ""))
  const checks = useMemo(() => validateRequisites({ bik, iik }), [bik, iik])
  const bankFromBik = useMemo(() => findBankByBik(bik), [bik])
  const bankNameSuggestion = useMemo(
    () => bankName && !findBankByName(bankName) ? findSingleBankSuggestion(bankName) : null,
    [bankName],
  )

  const handleBikChange = (value: string) => {
    const next = normalizeBik(value)
    setBik(next)
    const bank = findBankByBik(next)
    if (bank && shouldReplaceBankName(bankName, defaultBankName ?? "")) {
      setBankName(bank.name)
    }
  }

  const handleBankNameChange = (value: string) => {
    const next = value.slice(0, 160)
    setBankName(next)
    const bank = findBankByName(next) ?? findSingleBankSuggestion(next)
    if (bank) setBik(bank.bik)
  }

  const handleBankNameBlur = () => {
    const bank = findBankByName(bankName) ?? findSingleBankSuggestion(bankName)
    if (!bank) return
    setBankName(bank.name)
    setBik(bank.bik)
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div>
        <label className={labelClass}>Название банка</label>
        <input
          name={bankNameName}
          value={bankName}
          onChange={(event) => handleBankNameChange(event.target.value)}
          onBlur={handleBankNameBlur}
          list={bankNameListId}
          className={inputClass}
          placeholder="Начните писать банк или выберите из списка"
        />
        <datalist id={bankNameListId}>
          {KZ_BANKS.map((bank) => (
            <option key={bank.bik} value={bank.name} label={`${bank.bik} - ${bank.short}`} />
          ))}
        </datalist>
        {bankNameSuggestion && (
          <p className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-300">
            Найдено: {bankNameSuggestion.name}
          </p>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className={labelClass}>БИК</label>
          {bik && <StatusIcon ok={checks.bik?.ok ?? null} />}
        </div>
        <input
          name={bikName}
          value={bik}
          onChange={(event) => handleBikChange(event.target.value)}
          onBlur={() => {
            const bank = findBankByBik(bik)
            if (bank && shouldReplaceBankName(bankName, defaultBankName ?? "")) setBankName(bank.name)
          }}
          list={bikListId}
          maxLength={8}
          className={`${inputClass} font-mono uppercase`}
          placeholder="CASPKZKA"
        />
        <datalist id={bikListId}>
          {KZ_BANKS.map((bank) => (
            <option key={bank.bik} value={bank.bik} label={`${bank.short} - ${bank.name}`} />
          ))}
        </datalist>
        {bankFromBik && (
          <p className="mt-1 text-[10px] text-emerald-700 dark:text-emerald-300">{bankFromBik.name}</p>
        )}
        {bik && checks.bik?.warning && (
          <p className={`mt-1 text-[10px] ${checks.bik.ok ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>
            {checks.bik.warning}
          </p>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className={labelClass}>ИИК / расчётный счёт</label>
          {iik && <StatusIcon ok={checks.iik?.ok ?? null} />}
        </div>
        <input
          name={iikName}
          value={iik}
          onChange={(event) => setIik(normalizeIikInput(event.target.value))}
          maxLength={20}
          className={`${inputClass} font-mono uppercase`}
          placeholder="KZ86125KZT1001300335"
        />
        <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Длина: {iik.length}/20</p>
        {iik && checks.iik?.warning && (
          <p className="mt-1 text-[10px] text-red-600 dark:text-red-400">{checks.iik.warning}</p>
        )}
      </div>
    </div>
  )
}

function StatusIcon({ ok }: { ok: boolean | null }) {
  if (ok === null) return null
  return ok ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
      <Check className="h-3 w-3" /> OK
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600 dark:text-red-400">
      <AlertTriangle className="h-3 w-3" /> Ошибка
    </span>
  )
}

function normalizeBik(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)
}

function normalizeIikInput(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20)
}

function shouldReplaceBankName(currentBankName: string, initialBankName: string) {
  const value = currentBankName.trim()
  return !value || value === initialBankName || isKnownBankName(value)
}
