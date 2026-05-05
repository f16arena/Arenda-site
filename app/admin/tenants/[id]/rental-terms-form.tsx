"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileText, LockKeyhole, PencilLine } from "lucide-react"
import { toast } from "sonner"
import { updateTenantRentalTerms } from "@/app/actions/tenant"
import type { RentMode } from "@/lib/rent"

type RentalTermsInitial = {
  customRate: number | null
  fixedMonthlyRent: number | null
  cleaningFee: number
  needsCleaning: boolean
  paymentDueDay: number
  penaltyPercent: number
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

export function RentalTermsForm({ tenantId, locked, lockedReason, initial }: Props) {
  const router = useRouter()
  const [addendumMode, setAddendumMode] = useState(false)
  const [rentMode, setRentMode] = useState<RentMode>(() => initialRentMode(initial))
  const [customRate, setCustomRate] = useState(() => initialRentMode(initial) === "RATE" ? String(initial.customRate ?? "") : "")
  const [fixedMonthlyRent, setFixedMonthlyRent] = useState(() => initialRentMode(initial) === "FIXED" ? String(initial.fixedMonthlyRent ?? "") : "")
  const [pending, startTransition] = useTransition()
  const termsDisabled = locked && !addendumMode
  const today = new Date().toISOString().slice(0, 10)

  const changeRentMode = (nextMode: RentMode) => {
    setRentMode(nextMode)
    if (nextMode !== "RATE") setCustomRate("")
    if (nextMode !== "FIXED") setFixedMonthlyRent("")
  }

  const submit = (formData: FormData) => {
    startTransition(async () => {
      try {
        const result = await updateTenantRentalTerms(tenantId, formData)
        toast.success(result.addendumCreated
          ? "Условия сохранены, доп. соглашение создано"
          : "Условия аренды сохранены")
        setAddendumMode(false)
        router.refresh()
      } catch (error) {
        toast.error(errorMessage(error))
      }
    })
  }

  return (
    <form action={submit} className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
      <input type="hidden" name="rentMode" value={rentMode} />
      {locked && (
        <div className="md:col-span-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-2">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Условия аренды закреплены договором</p>
                <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-200">
                  {lockedReason ?? "Для изменения условий нужно оформить дополнительное соглашение."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAddendumMode((value) => !value)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-900 px-3 py-2 text-xs font-medium text-white hover:bg-amber-800 dark:bg-amber-300 dark:text-amber-950 dark:hover:bg-amber-200"
            >
              <PencilLine className="h-3.5 w-3.5" />
              {addendumMode ? "Отменить" : "Изменить по доп. соглашению"}
            </button>
          </div>
        </div>
      )}

      <fieldset className="md:col-span-3" disabled={termsDisabled || pending}>
        <legend className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          Способ расчета аренды
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            ["FLOOR", "По ставке этажа"],
            ["RATE", "Ставка за м²"],
            ["FIXED", "Сумма в месяц"],
          ].map(([mode, label]) => (
            <label
              key={mode}
              className={`flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                rentMode === mode
                  ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/10 dark:text-blue-200"
                  : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:text-slate-300"
              } ${termsDisabled || pending ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="radio"
                name="rentModeChoice"
                value={mode}
                checked={rentMode === mode}
                onChange={() => changeRentMode(mode as RentMode)}
                disabled={termsDisabled || pending}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
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
          disabled={termsDisabled || pending || rentMode !== "RATE"}
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
          disabled={termsDisabled || pending || rentMode !== "FIXED"}
          required={rentMode === "FIXED"}
          className={inputClass}
        />
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          Нельзя указать одновременно со ставкой за м²
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Уборка ₸/мес</label>
        <input
          name="cleaningFee"
          type="number"
          step="0.01"
          defaultValue={initial.cleaningFee}
          disabled={termsDisabled || pending}
          className={inputClass}
        />
      </div>
      <div className="flex items-end pb-2">
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            name="needsCleaning"
            type="checkbox"
            defaultChecked={initial.needsCleaning}
            disabled={termsDisabled || pending}
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
          disabled={termsDisabled || pending}
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
          disabled={termsDisabled || pending}
          className={inputClass}
        />
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          При просрочке (0 = без пени)
        </p>
      </div>
      {locked && addendumMode && (
        <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              № доп. соглашения
            </label>
            <input
              name="addendumNumber"
              required
              maxLength={80}
              placeholder="ДС-001"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Дата соглашения
            </label>
            <input
              name="addendumDate"
              type="date"
              required
              defaultValue={today}
              className={inputClass}
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Изменения
            </label>
            <textarea
              name="addendumChanges"
              required
              minLength={10}
              rows={3}
              placeholder="Например: с 01.06.2026 аренда составляет 650 000 ₸/мес, остальные условия без изменений."
              className={`${inputClass} resize-none`}
            />
          </div>
        </div>
      )}

      <div className="md:col-span-3 flex justify-end">
        <button
          type={termsDisabled ? "button" : "submit"}
          disabled={termsDisabled || pending}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 dark:disabled:bg-slate-700"
        >
          {locked && addendumMode && <FileText className="h-4 w-4" />}
          {pending ? "Сохранение..." : locked && addendumMode ? "Сохранить и создать доп. соглашение" : termsDisabled ? "Заблокировано" : "Сохранить"}
        </button>
      </div>
    </form>
  )
}
