"use client"

import { useState, useRef, useEffect, useReducer, useTransition } from "react"
import { Download, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { lookupTaxpayerAction } from "@/app/actions/taxpayer-lookup"
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
  // Удостоверение личности (только для физлица). Даты — yyyy-MM-dd.
  initialIdDocNumber?: string | null
  initialIdDocIssuedBy?: string | null
  initialIdDocIssuedAt?: string | null
  initialIdDocExpiresAt?: string | null
  /** Уведомлять родителя о смене правовой формы (для зависимых полей в форме). */
  onLegalTypeChange?: (legalType: TenantLegalType) => void
}

export function TenantIdentityFields({
  initialLegalType, initialBin, initialIin,
  initialIdDocNumber, initialIdDocIssuedBy, initialIdDocIssuedAt, initialIdDocExpiresAt,
  onLegalTypeChange,
}: Props) {
  const [legalType, setLegalType] = useState<TenantLegalType>(normalizeTenantLegalType(initialLegalType))
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
  const taxIdLabel = tenantTaxIdLabel(legalType)
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
      const t = r.info.taxpayerType
      let detected: TenantLegalType | null = null
      if (t === "UL") detected = /акционерное общество/i.test(r.info.name ?? "") ? "AO" : "TOO"
      else if (t === "IP") detected = "IP"
      else if (t === "LZCHP") {
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
      const personName = t === "IP" || t === "LZCHP" ? stripIpPrefix(r.info.name) : r.info.director
      // Галочка «плательщик НДС» — из сервиса КГД «Поиск плательщиков НДС».
      // null = сервис не ответил → галочку не трогаем.
      const setCheckbox = (name: string, value: boolean | null) => {
        if (value === null) return false
        const input = form.elements.namedItem(name)
        if (!(input instanceof HTMLInputElement) || input.type !== "checkbox") return false
        if (input.checked !== value) {
          input.checked = value
          input.dispatchEvent(new Event("change", { bubbles: true }))
        }
        return true
      }
      const filled = [
        setField("companyName", r.info.name),
        setField("legalAddress", r.info.address),
        setField("directorName", r.info.director),
        // ФИО контакта — только если поле ещё пустое (не перетираем введённое).
        setField("name", personName, false),
        setCheckbox("isVatPayer", r.info.vatPayer),
      ].filter(Boolean).length
      const parts = [
        r.info.name && "наименование",
        detected && "правовая форма",
        r.info.address && "адрес",
        r.info.director && "руководитель",
        r.info.vatPayer !== null && "НДС",
      ].filter(Boolean).join(", ")
      if (filled > 0 || detected) toast.success(`Заполнено из КГД: ${parts}`)
      else if (r.info.status) toast.info("Налогоплательщик найден, но заполнять нечего")
      else toast.info("Справочник ответил, но подходящих полей в этой форме нет")
      // Статус регистрации + НДС-статус (постановка/снятие с учёта)
      const statusLine = [r.info.status, r.info.vatStatus].filter(Boolean).join(" · ")
      if (statusLine) toast.message("Статус в КГД", { description: statusLine, duration: 8000 })
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
          Правовая форма
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
        {taxId.length === 12 && (
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
        )}
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

      {/* Удостоверение личности — только для физлица: у него нет БИН/устава,
          основание в договоре = паспортные данные. Поля submit-ятся с формой. */}
      {legalType === "PHYSICAL" && (
        <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Удостоверение личности</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">№ удостоверения</label>
              <input
                name="idDocNumber"
                defaultValue={initialIdDocNumber ?? ""}
                placeholder="напр. 045678901"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Кем выдан</label>
              <input
                name="idDocIssuedBy"
                defaultValue={initialIdDocIssuedBy ?? ""}
                placeholder="напр. МВД РК"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Дата выдачи (от)</label>
              <input
                name="idDocIssuedAt"
                type="date"
                defaultValue={initialIdDocIssuedAt ?? ""}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Действует до</label>
              <input
                name="idDocExpiresAt"
                type="date"
                defaultValue={initialIdDocExpiresAt ?? ""}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white dark:bg-slate-900"
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            Подставится в шапку договора как основание физлица: «удостоверение личности №… от …, выдано …».
          </p>
        </div>
      )}
      {/* Sentinel: форма содержит блок удостоверения (даже если сейчас не физлицо) —
          чтобы updateTenant знал, что поля можно очищать/обновлять. */}
      <input type="hidden" name="idDocForm" value="1" />
    </>
  )
}
