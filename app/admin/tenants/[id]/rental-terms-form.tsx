"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { LockKeyhole, FileSignature } from "lucide-react"
import { toast } from "sonner"
import { updateTenantRentalTerms } from "@/app/actions/tenant"
import { formatMoney } from "@/lib/utils"
import type { RentMode } from "@/lib/rent"

type RentalTermsInitial = {
  customRate: number | null
  fixedMonthlyRent: number | null
  cleaningFee: number
  needsCleaning: boolean
  paymentDueDay: number
  penaltyPercent: number
  rentFreeMonths?: number | null
  depositAmount?: number | null
  /** YYYY-MM-DD строкой (если задана); используется для defaultValue input[type=date] */
  moveInDate?: string | null
}

type Props = {
  tenantId: string
  locked: boolean
  lockedReason: string | null
  initial: RentalTermsInitial
}

const inputClass =
  "w-full rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:bg-slate-800/70"

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Не удалось сохранить условия аренды"
}

function hasPositiveAmount(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

function initialRentMode(initial: RentalTermsInitial): RentMode {
  if (hasPositiveAmount(initial.fixedMonthlyRent)) return "FIXED"
  if (hasPositiveAmount(initial.customRate)) return "RATE"
  return "FLOOR"
}

/** Строка «значение» для read-only режима. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm dark:border-slate-800 last:border-0">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-right font-medium text-slate-900 dark:text-slate-100 tabular-nums">{value}</dd>
    </div>
  )
}

export function RentalTermsForm({ tenantId, locked, lockedReason, initial }: Props) {
  const router = useRouter()
  const [rentMode, setRentMode] = useState<RentMode>(() => initialRentMode(initial))
  const [customRate, setCustomRate] = useState(() => initialRentMode(initial) === "RATE" ? String(initial.customRate ?? "") : "")
  const [fixedMonthlyRent, setFixedMonthlyRent] = useState(() => initialRentMode(initial) === "FIXED" ? String(initial.fixedMonthlyRent ?? "") : "")
  const [pending, startTransition] = useTransition()

  const changeRentMode = (nextMode: RentMode) => {
    setRentMode(nextMode)
    if (nextMode !== "RATE") setCustomRate("")
    if (nextMode !== "FIXED") setFixedMonthlyRent("")
  }

  const submit = (formData: FormData) => {
    startTransition(async () => {
      try {
        await updateTenantRentalTerms(tenantId, formData)
        toast.success("Условия аренды сохранены")
        router.refresh()
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  // ── Закреплено договором → только просмотр; изменения только через ДС. ──────────
  if (locked) {
    const mode = initialRentMode(initial)
    const methodLabel = mode === "FIXED" ? "Фиксированная сумма" : mode === "RATE" ? "Индивидуальная ставка ₸/м²" : "По ставке этажа"
    const rentValue = mode === "FIXED"
      ? `${formatMoney(initial.fixedMonthlyRent ?? 0)}/мес`
      : mode === "RATE"
        ? `${formatMoney(initial.customRate ?? 0)}/м²`
        : "—"
    return (
      <div className="p-5 space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-2">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
              <div>
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Условия аренды закреплены договором</p>
                <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-200">
                  {lockedReason ?? "Эти данные берутся из договора. Изменить их можно только дополнительным соглашением (ДС) с подписью арендатора."}
                </p>
              </div>
            </div>
            <Link
              href={`/admin/documents?create=addendum&tenantId=${tenantId}`}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-amber-900 px-3 py-2 text-xs font-medium text-white hover:bg-amber-800 dark:bg-amber-300 dark:text-amber-950 dark:hover:bg-amber-200"
            >
              <FileSignature className="h-3.5 w-3.5" />
              Изменить через доп. соглашение
            </Link>
          </div>
        </div>

        <dl className="rounded-lg border border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
          <Row label="Способ расчёта" value={methodLabel} />
          {mode !== "FLOOR" && <Row label="Стоимость аренды" value={rentValue} />}
          <Row label="Уборка" value={initial.needsCleaning ? `${formatMoney(initial.cleaningFee)}/мес` : "не требуется"} />
          <Row label="День оплаты" value={`${initial.paymentDueDay} числа`} />
          <Row label="Пеня за просрочку" value={initial.penaltyPercent > 0 ? `${initial.penaltyPercent}% в день` : "без пени"} />
          {typeof initial.depositAmount === "number" && initial.depositAmount > 0 && (
            <Row label="Депозит" value={formatMoney(initial.depositAmount)} />
          )}
          {typeof initial.rentFreeMonths === "number" && initial.rentFreeMonths > 0 && (
            <Row label="Каникулы" value={`${initial.rentFreeMonths} мес.`} />
          )}
          {initial.moveInDate && (
            <Row label="Дата заселения" value={new Date(initial.moveInDate).toLocaleDateString("ru-RU")} />
          )}
        </dl>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Значения подтягиваются из договора и применённых ДС. Прямое редактирование отключено —
          любое изменение оформляется доп. соглашением и вступает в силу после подписи арендатора.
        </p>
      </div>
    )
  }

  // ── Договора ещё нет → первичная настройка условий вручную. ────────────────────
  return (
    <form action={submit} className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
      <input type="hidden" name="rentMode" value={rentMode} />

      <fieldset className="md:col-span-3" disabled={pending}>
        <legend className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          Способ расчёта аренды
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {([
            ["FLOOR", "По ставке этажа", "Площадь × ставка ₸/м² этажа"],
            ["RATE", "Индивидуальная ставка м²", "Площадь × своя ставка"],
            ["FIXED", "Фиксированная сумма", "Договорная сумма независимо от площади"],
          ] as const).map(([mode, label, hint]) => (
            <label
              key={mode}
              className={`flex cursor-pointer flex-col items-start rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                rentMode === mode
                  ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-200"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:text-slate-300"
              }`}
            >
              <input
                type="radio"
                name="rentModeChoice"
                value={mode}
                checked={rentMode === mode}
                onChange={() => changeRentMode(mode as RentMode)}
                disabled={pending}
                className="sr-only"
              />
              <span>{label}</span>
              <span className="mt-0.5 text-[11px] font-normal text-slate-500 dark:text-slate-400">{hint}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
          После подписания договора эти условия закрепляются и меняются только через ДС.
        </p>
      </fieldset>

      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Индивид. ставка ₸/м²</label>
        <input
          name="customRate"
          type="number"
          step="0.01"
          min={0}
          value={customRate}
          onChange={(event) => setCustomRate(event.target.value)}
          placeholder="Если отличается от этажной"
          disabled={pending || rentMode !== "RATE"}
          required={rentMode === "RATE"}
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Индивид. аренда ₸/мес</label>
        <input
          name="fixedMonthlyRent"
          type="number"
          step="0.01"
          min={0}
          value={fixedMonthlyRent}
          onChange={(event) => setFixedMonthlyRent(event.target.value)}
          placeholder="Если договор на сумму"
          disabled={pending || rentMode !== "FIXED"}
          required={rentMode === "FIXED"}
          className={inputClass}
        />
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          Нельзя указать одновременно со ставкой за м²
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          Дата заселения
        </label>
        <input
          name="moveInDate"
          type="date"
          defaultValue={initial.moveInDate ?? ""}
          disabled={pending}
          className={inputClass}
        />
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          Если пусто — = дата начала договора. Точка отсчёта каникул.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          Каникулы, мес.
        </label>
        <input
          name="rentFreeMonths"
          type="number"
          min={0}
          max={24}
          step={1}
          defaultValue={initial.rentFreeMonths ?? 0}
          disabled={pending}
          className={inputClass}
          placeholder="0"
        />
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          Первые N мес. после начала договора — 0 ₸ (ремонт, заселение)
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          Депозит ₸
        </label>
        <input
          name="depositAmount"
          type="number"
          min={0}
          step="0.01"
          defaultValue={initial.depositAmount ?? ""}
          disabled={pending}
          className={inputClass}
          placeholder="по умолчанию = месячная аренда"
        />
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          Гарантийный депозит. Если пусто — = 1 месяцу аренды
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Уборка ₸/мес</label>
        <input
          name="cleaningFee"
          type="number"
          step="0.01"
          defaultValue={initial.cleaningFee}
          disabled={pending}
          className={inputClass}
        />
      </div>
      <div className="flex items-end pb-2">
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            name="needsCleaning"
            type="checkbox"
            defaultChecked={initial.needsCleaning}
            disabled={pending}
            className="rounded border-slate-300 disabled:cursor-not-allowed"
          />
          Требуется уборка
        </label>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          День оплаты (1-31)
        </label>
        <input
          name="paymentDueDay"
          type="number"
          min={1}
          max={31}
          defaultValue={initial.paymentDueDay}
          disabled={pending}
          className={inputClass}
        />
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          Срок оплаты счета в каждом месяце
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          Пеня % в день
        </label>
        <input
          name="penaltyPercent"
          type="number"
          step="0.1"
          min={0}
          max={100}
          defaultValue={initial.penaltyPercent}
          disabled={pending}
          className={inputClass}
        />
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          При просрочке (0 = без пени)
        </p>
      </div>

      <div className="md:col-span-3 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700"
        >
          {pending ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
    </form>
  )
}
