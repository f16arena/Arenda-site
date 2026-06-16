"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { Download, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { lookupTaxpayerAction } from "@/app/actions/taxpayer-lookup"

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
  const selectRef = useRef<HTMLSelectElement>(null)
  const [lookupPending, startLookup] = useTransition()
  // Текущий налоговый номер (тот, что активен для выбранной формы).
  const taxId = usesBin ? binValue : usesIin ? iinValue : (binValue || iinValue)

  // Автозаполнение реквизитов организации из справочника КГД по БИН/ИИН —
  // тот же сервис, что и в карточке арендатора. Заполняем поля ТОЙ ЖЕ формы
  // по name (legalName/directorName/legalAddress). auto=true — фоновый запуск
  // при вводе 12 цифр (ошибки «не найден» молчат).
  function fillFromRegistry(auto = false) {
    if (taxId.length !== 12) return
    startLookup(async () => {
      const r = await lookupTaxpayerAction(taxId, usesBin ? "UL" : "IP")
      if (!r.ok) {
        if (!auto) toast.error(r.error)
        return
      }
      // Определяем правовую форму по типу налогоплательщика КГД.
      const t = r.info.taxpayerType
      let detected: string | null = null
      if (t === "UL") detected = /акционерное общество/i.test(r.info.name ?? "") ? "AO" : "TOO"
      else if (t === "IP") detected = "IP"
      if (detected && detected !== type) setType(detected)

      const form = selectRef.current?.form
      if (!form) return
      const setField = (name: string, value: string | null, overwrite = true) => {
        if (!value) return false
        const input = form.elements.namedItem(name)
        if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) return false
        if (!overwrite && input.value.trim()) return false
        input.value = value
        input.dispatchEvent(new Event("input", { bubbles: true }))
        return true
      }
      // У ИП руководитель = сам предприниматель (директора у КГД нет).
      const directorName = r.info.director || (t === "IP" ? stripIpPrefix(r.info.name) : null)
      const filled = [
        setField("legalName", r.info.name),
        setField("directorName", directorName),
        setField("legalAddress", r.info.address),
        // Краткое название — только если ещё пустое (не перетираем введённое).
        setField("shortName", r.info.name, false),
      ].filter(Boolean).length
      const parts = [
        r.info.name && "наименование",
        detected && "правовая форма",
        directorName && "руководитель",
        r.info.address && "адрес",
      ].filter(Boolean).join(", ")
      if (filled > 0 || detected) toast.success(`Заполнено из КГД: ${parts}`)
      else toast.info("Налогоплательщик найден, но заполнять нечего")
      const statusLine = [r.info.status, r.info.vatStatus].filter(Boolean).join(" · ")
      if (statusLine) toast.message("Статус в КГД", { description: statusLine, duration: 8000 })
    })
  }

  // Автопоиск при вводе всех 12 цифр (с дебаунсом), без повторов для того же номера.
  const fillRef = useRef(fillFromRegistry)
  useEffect(() => { fillRef.current = fillFromRegistry })
  const autoLookedUpRef = useRef<string | null>(taxId.length === 12 ? taxId : null)
  useEffect(() => {
    if (taxId.length !== 12 || autoLookedUpRef.current === taxId) return
    const timer = setTimeout(() => {
      autoLookedUpRef.current = taxId
      fillRef.current(true)
    }, 500)
    return () => clearTimeout(timer)
  }, [taxId])

  const lookupButton = taxId.length === 12 ? (
    <button
      type="button"
      onClick={() => fillFromRegistry()}
      disabled={lookupPending}
      title="Подтянуть наименование, адрес и руководителя из справочника налогоплательщиков КГД"
      className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
    >
      {lookupPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
      Заполнить из КГД
    </button>
  ) : null

  return (
    <>
      <div>
        <label className={labelClass}>Правовая форма</label>
        <select
          ref={selectRef}
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
          {lookupButton}
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
          {lookupButton}
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
          <div className="lg:col-span-2">{lookupButton}</div>
          <p className="lg:col-span-2 text-[11px] text-slate-400 dark:text-slate-500">{taxHint}</p>
        </div>
      )}
    </>
  )
}

/** «ИП "Тулебаев Б.К."» → «Тулебаев Б.К.» (убираем префикс ИП и кавычки). */
function stripIpPrefix(raw: string | null): string | null {
  if (!raw) return null
  const cleaned = raw
    .replace(/^индивидуальный\s+предприниматель/i, "")
    .replace(/^ИП\b\.?/i, "")
    .trim()
    .replace(/^["'«»]+/, "")
    .replace(/["'«»]+$/, "")
    .trim()
  return cleaned || raw
}

function normalizeLegalType(value: string | null | undefined) {
  const type = String(value ?? "").trim().toUpperCase()
  return LEGAL_TYPES.some((item) => item.value === type) ? type : "IP"
}

function onlyDigits(value: string | null | undefined) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 12)
}
