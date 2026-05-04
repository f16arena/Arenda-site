"use client"

import { useMemo, useState } from "react"

type Props = {
  legalType: string | null
  bin: string | null
  iin: string | null
  inputClass: string
  labelClass: string
}

const LEGAL_TYPES = [
  { value: "IP", label: "ИП" },
  { value: "TOO", label: "ТОО" },
  { value: "AO", label: "АО" },
  { value: "PHYSICAL", label: "Физическое лицо" },
  { value: "OTHER", label: "Другое" },
]

export function OrganizationIdentityFields({
  legalType,
  bin,
  iin,
  inputClass,
  labelClass,
}: Props) {
  const [type, setType] = useState(normalizeLegalType(legalType))
  const [binValue, setBinValue] = useState(onlyDigits(bin))
  const [iinValue, setIinValue] = useState(onlyDigits(iin))
  const usesBin = type === "TOO" || type === "AO"
  const usesIin = type === "IP" || type === "PHYSICAL"
  const taxHint = useMemo(() => {
    if (usesBin) return "БИН обязателен для ТОО/АО. ИИН здесь не нужен."
    if (usesIin) return "ИИН обязателен для ИП и физлица. БИН очищается автоматически."
    return "Для другого типа можно заполнить БИН или ИИН, если он есть."
  }, [usesBin, usesIin])

  return (
    <>
      <div>
        <label className={labelClass}>Правовая форма</label>
        <select
          name="legalType"
          value={type}
          onChange={(event) => {
            const nextType = normalizeLegalType(event.target.value)
            setType(nextType)
            if (nextType === "TOO" || nextType === "AO") setIinValue("")
            if (nextType === "IP" || nextType === "PHYSICAL") setBinValue("")
          }}
          className={inputClass}
        >
          {LEGAL_TYPES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {usesBin ? (
        <div>
          <label className={labelClass}>БИН *</label>
          <input
            name="bin"
            value={binValue}
            onChange={(event) => setBinValue(onlyDigits(event.target.value))}
            inputMode="numeric"
            minLength={12}
            maxLength={12}
            pattern="[0-9]{12}"
            required
            className={inputClass}
            placeholder="12 цифр"
          />
          <input type="hidden" name="iin" value="" />
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{taxHint}</p>
        </div>
      ) : usesIin ? (
        <div>
          <label className={labelClass}>ИИН *</label>
          <input
            name="iin"
            value={iinValue}
            onChange={(event) => setIinValue(onlyDigits(event.target.value))}
            inputMode="numeric"
            minLength={12}
            maxLength={12}
            pattern="[0-9]{12}"
            required
            className={inputClass}
            placeholder="12 цифр"
          />
          <input type="hidden" name="bin" value="" />
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{taxHint}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div>
            <label className={labelClass}>БИН</label>
            <input
              name="bin"
              value={binValue}
              onChange={(event) => setBinValue(onlyDigits(event.target.value))}
              inputMode="numeric"
              maxLength={12}
              className={inputClass}
              placeholder="12 цифр"
            />
          </div>
          <div>
            <label className={labelClass}>ИИН</label>
            <input
              name="iin"
              value={iinValue}
              onChange={(event) => setIinValue(onlyDigits(event.target.value))}
              inputMode="numeric"
              maxLength={12}
              className={inputClass}
              placeholder="12 цифр"
            />
          </div>
          <p className="lg:col-span-2 text-[11px] text-slate-400 dark:text-slate-500">{taxHint}</p>
        </div>
      )}
    </>
  )
}

function normalizeLegalType(value: string | null | undefined) {
  const type = String(value ?? "").trim().toUpperCase()
  return LEGAL_TYPES.some((item) => item.value === type) ? type : "IP"
}

function onlyDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 12)
}
