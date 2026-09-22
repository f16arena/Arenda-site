"use client"

import { useState, useRef, useEffect, useReducer, useTransition } from "react"
import { Download, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { lookupTaxpayerAction } from "@/app/actions/taxpayer-lookup"
import { Input } from "@/components/ui/input"
import { formatKzIinBirthDate, validateKazakhstanIin } from "@/lib/kz-iin"
import { DEFAULT_KZ_VAT_RATE } from "@/lib/kz-vat"
import {
  normalizeTenantLegalType,
  tenantLegalTypeUsesBin,
  tenantTaxIdValue,
  type TenantLegalType,
} from "@/lib/tenant-identity"
import { useT } from "@/lib/i18n/client"

type Props = {
  initialLegalType?: string | null
  initialBin?: string | null
  initialIin?: string | null
  // Удостоверение личности (только для физлица). Даты — yyyy-MM-dd.
  initialIdDocNumber?: string | null
  initialIdDocIssuedBy?: string | null
  initialIdDocIssuedAt?: string | null
  initialIdDocExpiresAt?: string | null
  // НДС-статус арендатора (определяется автоматически из КГД). Для карточки —
  // текущее сохранённое значение; в форме создания не передаётся (null = не определён).
  initialIsVatPayer?: boolean | null
  initialVatStatus?: string | null
  /** Уведомлять родителя о смене правовой формы (для зависимых полей в форме). */
  onLegalTypeChange?: (legalType: TenantLegalType) => void
}

export function TenantIdentityFields({
  initialLegalType, initialBin, initialIin,
  initialIdDocNumber, initialIdDocIssuedBy, initialIdDocIssuedAt, initialIdDocExpiresAt,
  initialIsVatPayer, initialVatStatus,
  onLegalTypeChange,
}: Props) {
  const { t } = useT()
  const [legalType, setLegalType] = useState<TenantLegalType>(normalizeTenantLegalType(initialLegalType))
  // НДС определяется автоматически из КГД. null = ещё не определялся.
  const [vatPayer, setVatPayer] = useState<boolean | null>(
    typeof initialIsVatPayer === "boolean" ? initialIsVatPayer : null,
  )
  const [vatStatus, setVatStatus] = useState<string | null>(initialVatStatus ?? null)
  const [taxId, setTaxId] = useState(() =>
    tenantTaxIdValue({ legalType: initialLegalType, bin: initialBin, iin: initialIin }),
  )
  const selectRef = useRef<HTMLSelectElement>(null)
  const [, forceRender] = useReducer((x: number) => x + 1, 0)

  // Сообщаем родителю текущую правовую форму (через ref, чтобы инлайн-колбэк не
  // вызывал перезапуск эффекта). Нужно company-form: для физлица скрываем
  // директора/основание, меняем подписи полей.
  const onLegalTypeChangeRef = useRef(onLegalTypeChange)
  useEffect(() => { onLegalTypeChangeRef.current = onLegalTypeChange })
  useEffect(() => { onLegalTypeChangeRef.current?.(legalType) }, [legalType])

  // React 19 после server-action делает form.reset(): нативный сброс обнуляет DOM
  // контролируемых полей (select → первый вариант, input → пусто), а React не
  // перерисовывает (state не менялся) — сброс остаётся видимым. Ловим событие reset
  // и принудительно перерисовываем, чтобы вернуть контролируемые value из state.
  useEffect(() => {
    const form = selectRef.current?.form
    if (!form) return
    const onReset = () => requestAnimationFrame(forceRender)
    form.addEventListener("reset", onReset)
    return () => form.removeEventListener("reset", onReset)
  }, [])
  const usesBin = tenantLegalTypeUsesBin(legalType)
  const taxIdLabel = usesBin ? t("adminTenants.identity.bin") : t("adminTenants.identity.iin")
  const iinValidation = !usesBin && taxId.length === 12 ? validateKazakhstanIin(taxId) : null
  const [lookupPending, startLookup] = useTransition()

  // Автозаполнение из справочника КГД: подставляем наименование/адрес/директора
  // в соседние поля ТОЙ ЖЕ формы (поля по name — работает в диалоге, мастере и карточке).
  // auto=true — фоновый запуск при вводе 12 цифр: ошибки «не найден» молчат.
  function fillFromRegistry(auto = false) {
    startLookup(async () => {
      // Нотариус/адвокат/ЧСИ в КГД — «лицо, занимающееся частной практикой» (LZCHP)
      const kgdKind = usesBin
        ? ("UL" as const)
        : legalType === "CHSI" || legalType === "ADVOKAT" || legalType === "NOTARIUS"
          ? ("LZCHP" as const)
          : ("IP" as const)
      const r = await lookupTaxpayerAction(taxId, kgdKind)
      if (!r.ok) {
        if (!auto) toast.error(r.error)
        return
      }

      // Правовая форма из типа налогоплательщика КГД (UL → ТОО/АО по названию,
      // IP → ИП, LZCHP → нотариус/адвокат/ЧСИ по виду практики).
      const taxpayerType = r.info.taxpayerType
      let detected: TenantLegalType | null = null
      if (taxpayerType === "UL") detected = /акционерное общество/i.test(r.info.name ?? "") ? "AO" : "TOO"
      else if (taxpayerType === "IP") detected = "IP"
      else if (taxpayerType === "LZCHP") {
        const k = (r.info.lzchpType ?? "").toUpperCase()
        detected = k.includes("NOTAR") ? "NOTARIUS"
          : k.includes("ADVOC") || k.includes("LAWYER") ? "ADVOKAT"
          : k.includes("BAILIFF") || k.includes("CHSI") ? "CHSI"
          : null
      }
      if (detected && detected !== legalType) setLegalType(detected)

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
      // У ИП/частной практики наименование = ФИО предпринимателя → контактное лицо.
      // КГД отдаёт официальное название («ИП "Тулебаев Б.К."») — для контакта
      // убираем префикс ИП и кавычки, остаётся чистое ФИО.
      const stripIpPrefix = (raw: string | null): string | null => {
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
      const personName = taxpayerType === "IP" || taxpayerType === "LZCHP" ? stripIpPrefix(r.info.name) : r.info.director
      // НДС-статус — из сервиса КГД «Поиск плательщиков НДС». null = сервис не
      // ответил → прежнее значение не трогаем (статус остаётся «не определён»).
      if (r.info.vatPayer !== null) {
        setVatPayer(r.info.vatPayer)
        setVatStatus(r.info.vatStatus ?? null)
      }
      const filled = [
        setField("companyName", r.info.name),
        setField("legalAddress", r.info.address),
        setField("directorName", r.info.director),
        // ФИО контакта — только если поле ещё пустое (не перетираем введённое).
        setField("name", personName, false),
        r.info.vatPayer !== null,
      ].filter(Boolean).length
      const parts = [
        r.info.name && t("adminTenants.identity.lookup.parts.name"),
        detected && t("adminTenants.identity.lookup.parts.legalForm"),
        r.info.address && t("adminTenants.identity.lookup.parts.address"),
        r.info.director && t("adminTenants.identity.lookup.parts.director"),
        r.info.vatPayer !== null && t("adminTenants.identity.lookup.parts.vat"),
      ].filter(Boolean).join(", ")
      if (filled > 0 || detected) toast.success(t("adminTenants.identity.lookup.filled", { parts }))
      else if (r.info.status) toast.info(t("adminTenants.identity.lookup.nothingToFill"))
      else toast.info(t("adminTenants.identity.lookup.noFields"))
      // Статус регистрации + НДС-статус (постановка/снятие с учёта)
      const statusLine = [r.info.status, r.info.vatStatus].filter(Boolean).join(" · ")
      if (statusLine) toast.message(t("adminTenants.identity.lookup.statusTitle"), { description: statusLine, duration: 8000 })
    })
  }

  // Автопоиск: как только введены все 12 цифр — сами дёргаем КГД (без клика).
  // Повторно для того же номера не запрашиваем; при открытии карточки с уже
  // заполненным ИИН/БИН тоже не дёргаем (initial значение записано в ref).
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

  return (
    <>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          {t("adminTenants.identity.legalForm")}
        </label>
        <select
          ref={selectRef}
          name="legalType"
          value={legalType}
          onChange={(event) => {
            setLegalType(normalizeTenantLegalType(event.target.value))
            setTaxId("")
          }}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900"
        >
          <option value="IP">{t("adminTenants.identity.options.IP")}</option>
          <option value="TOO">{t("adminTenants.identity.options.TOO")}</option>
          <option value="AO">{t("adminTenants.identity.options.AO")}</option>
          <option value="CHSI">{t("adminTenants.identity.options.CHSI")}</option>
          <option value="ADVOKAT">{t("adminTenants.identity.options.ADVOKAT")}</option>
          <option value="NOTARIUS">{t("adminTenants.identity.options.NOTARIUS")}</option>
          <option value="PHYSICAL">{t("adminTenants.identity.options.PHYSICAL")}</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          {taxIdLabel} <span className="text-slate-300 dark:text-slate-500">{t("adminTenants.identity.digits12")}</span>
        </label>
        <Input
          name={usesBin ? "bin" : "iin"}
          value={taxId}
          onChange={(event) => setTaxId(event.target.value.replace(/\D/g, "").slice(0, 12))}
          placeholder={
            usesBin
              ? t("adminTenants.identity.placeholders.bin")
              : legalType === "CHSI"
                ? t("adminTenants.identity.placeholders.chsi")
                : legalType === "ADVOKAT"
                  ? t("adminTenants.identity.placeholders.advokat")
                  : legalType === "NOTARIUS"
                    ? t("adminTenants.identity.placeholders.notarius")
                    : t("adminTenants.identity.placeholders.iin")
          }
          inputMode="numeric"
          pattern="\d{12}"
          maxLength={12}
          className={[
            "font-mono",
            iinValidation && !iinValidation.ok
              ? "border-red-300 focus:border-red-500 focus:ring-red-500/20"
              : "",
          ].join(" ")}
        />
        {taxId.length === 12 && (
          <button
            type="button"
            onClick={() => fillFromRegistry()}
            disabled={lookupPending}
            title={t("adminTenants.identity.lookupHint")}
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
          >
            {lookupPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            {t("adminTenants.identity.lookupButton")}
          </button>
        )}
        {!iinValidation && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("adminTenants.identity.digitsHint")}</p>
        )}
        {iinValidation && (
          <p className={[
            "mt-1 text-[11px]",
            iinValidation.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
          ].join(" ")}>
            {iinValidation.ok
              ? iinValidation.birthDate
                ? `${t("adminTenants.identity.checkOk")} · ${formatKzIinBirthDate(iinValidation.birthDate)} · ${iinValidation.genderLabel ?? t("adminTenants.identity.genderUnknown")}`
                : t("adminTenants.identity.checkOkNoDate")
              : iinValidation.errors[0]}
          </p>
        )}
        <input type="hidden" name={usesBin ? "iin" : "bin"} value="" />
      </div>

      {/* НДС — определяется АВТОМАТИЧЕСКИ из КГД по БИН/ИИН (без ручного ввода).
          Ставка единая по НК РК (КГД её не отдаёт). Скрытые поля сабмитятся с формой. */}
      <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("adminTenants.identity.vatTitle")}</p>
          {taxId.length === 12 && (
            <button
              type="button"
              onClick={() => fillFromRegistry()}
              disabled={lookupPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              {lookupPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {t("adminTenants.identity.vatRefresh")}
            </button>
          )}
        </div>
        <div className="mt-1.5 text-sm">
          {vatPayer === true ? (
            <span className="font-medium text-emerald-700 dark:text-emerald-300">
              ✅ {vatStatus?.trim() || t("adminTenants.identity.vatPayer")} · {t("adminTenants.identity.vatRate", { rate: DEFAULT_KZ_VAT_RATE })}
            </span>
          ) : vatStatus?.trim() ? (
            <span className="text-slate-600 dark:text-slate-400">{vatStatus}</span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">
              {t("adminTenants.identity.vatUnknown", { id: taxIdLabel })}
            </span>
          )}
        </div>
        <input type="hidden" name="isVatPayer" value={vatPayer ? "on" : "off"} />
        <input type="hidden" name="vatRate" value={DEFAULT_KZ_VAT_RATE} />
        <input type="hidden" name="vatStatus" value={vatStatus ?? ""} />
        {/* Sentinel: форма управляет НДС → updateTenant применит значения. */}
        <input type="hidden" name="isVatPayerForm" value="1" />
      </div>

      {/* Удостоверение личности — только для физлица: у него нет БИН/устава,
          основание в договоре = паспортные данные. Поля submit-ятся с формой. */}
      {legalType === "PHYSICAL" && (
        <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{t("adminTenants.identity.idDocTitle")}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminTenants.identity.idDocNumber")}</label>
              <Input
                name="idDocNumber"
                defaultValue={initialIdDocNumber ?? ""}
                placeholder={t("adminTenants.identity.idDocNumberPlaceholder")}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminTenants.identity.idDocIssuedBy")}</label>
              <Input
                name="idDocIssuedBy"
                defaultValue={initialIdDocIssuedBy ?? ""}
                placeholder={t("adminTenants.identity.idDocIssuedByPlaceholder")}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminTenants.identity.idDocIssuedAt")}</label>
              <Input
                name="idDocIssuedAt"
                type="date"
                defaultValue={initialIdDocIssuedAt ?? ""}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminTenants.identity.idDocExpiresAt")}</label>
              <Input
                name="idDocExpiresAt"
                type="date"
                defaultValue={initialIdDocExpiresAt ?? ""}
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            {t("adminTenants.identity.idDocHint")}
          </p>
        </div>
      )}
      {/* Sentinel: форма содержит блок удостоверения (даже если сейчас не физлицо) —
          чтобы updateTenant знал, что поля можно очищать/обновлять. */}
      <input type="hidden" name="idDocForm" value="1" />
    </>
  )
}
