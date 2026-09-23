"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { Download, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { lookupTaxpayerAction } from "@/app/actions/taxpayer-lookup"
import { useT } from "@/lib/i18n/client"

type Props = {
  legalType: string | null
  bin: string | null
  iin: string | null
  inputClass: string
  labelClass: string
}

// Справочник правовых форм: массив держит только код, подпись берётся из
// словаря при отрисовке (в казахском это ЖК / ЖШС / АҚ, а не транслит).
const LEGAL_TYPES = [
  { value: "IP", labelKey: "common.settings.identity.forms.IP" },
  { value: "TOO", labelKey: "common.settings.identity.forms.TOO" },
  { value: "AO", labelKey: "common.settings.identity.forms.AO" },
  { value: "PHYSICAL", labelKey: "common.settings.identity.forms.PHYSICAL" },
  { value: "OTHER", labelKey: "common.settings.identity.forms.OTHER" },
] as const

export function OrganizationIdentityFields({
  legalType,
  bin,
  iin,
  inputClass,
  labelClass,
}: Props) {
  const { t } = useT()
  const [type, setType] = useState(normalizeLegalType(legalType))
  const [binValue, setBinValue] = useState(onlyDigits(bin))
  const [iinValue, setIinValue] = useState(onlyDigits(iin))
  const usesBin = type === "TOO" || type === "AO"
  const usesIin = type === "IP" || type === "PHYSICAL"
  const taxHint = useMemo(() => {
    if (usesBin) return t("common.settings.identity.binRequired")
    if (usesIin) return t("common.settings.identity.iinRequired")
    return t("common.settings.identity.eitherHint")
  }, [usesBin, usesIin, t])
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
      const taxpayerType = r.info.taxpayerType
      let detected: string | null = null
      if (taxpayerType === "UL")
        // Справочник МКК возвращает форму на языке регистрации, поэтому
        // сверяем оба написания: иначе казахское АҚ определится как ЖШС.
        detected = /акционерное общество|акционерлік қоғам/i.test(r.info.name ?? "") ? "AO" : "TOO"
      else if (taxpayerType === "IP") detected = "IP"
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
      const directorName = r.info.director || (taxpayerType === "IP" ? stripIpPrefix(r.info.name) : null)
      const filled = [
        setField("legalName", r.info.name),
        setField("directorName", directorName),
        setField("legalAddress", r.info.address),
        // Краткое название — только если ещё пустое (не перетираем введённое).
        setField("shortName", r.info.name, false),
      ].filter(Boolean).length
      const parts = [
        r.info.name && t("common.settings.identity.partName"),
        detected && t("common.settings.identity.partForm"),
        directorName && t("common.settings.identity.partDirector"),
        r.info.address && t("common.settings.identity.partAddress"),
      ].filter(Boolean).join(", ")
      if (filled > 0 || detected) toast.success(t("common.settings.identity.filled", { parts }))
      else toast.info(t("common.settings.identity.nothingToFill"))
      const statusLine = [r.info.status, r.info.vatStatus].filter(Boolean).join(" · ")
      if (statusLine) toast.message(t("common.settings.identity.kgdStatus"), { description: statusLine, duration: 8000 })
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
      title={t("common.settings.identity.fillFromKgdTitle")}
      className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
    >
      {lookupPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
      {t("common.settings.identity.fillFromKgd")}
    </button>
  ) : null

  return (
    <>
      <div>
        <label className={labelClass}>{t("common.settings.identity.legalForm")}</label>
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
              {t(item.labelKey)}
            </option>
          ))}
        </select>
      </div>

      {usesBin ? (
        <div>
          <label className={labelClass}>{t("common.settings.identity.binLabel")} *</label>
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
            placeholder={t("common.settings.identity.digits12")}
          />
          <input type="hidden" name="iin" value="" />
          {lookupButton}
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{taxHint}</p>
        </div>
      ) : usesIin ? (
        <div>
          <label className={labelClass}>{t("common.settings.identity.iinLabel")} *</label>
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
            placeholder={t("common.settings.identity.digits12")}
          />
          <input type="hidden" name="bin" value="" />
          {lookupButton}
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{taxHint}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div>
            <label className={labelClass}>{t("common.settings.identity.binLabel")}</label>
            <input
              name="bin"
              value={binValue}
              onChange={(event) => setBinValue(onlyDigits(event.target.value))}
              inputMode="numeric"
              maxLength={12}
              className={inputClass}
              placeholder={t("common.settings.identity.digits12")}
            />
          </div>
          <div>
            <label className={labelClass}>{t("common.settings.identity.iinLabel")}</label>
            <input
              name="iin"
              value={iinValue}
              onChange={(event) => setIinValue(onlyDigits(event.target.value))}
              inputMode="numeric"
              maxLength={12}
              className={inputClass}
              placeholder={t("common.settings.identity.digits12")}
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
