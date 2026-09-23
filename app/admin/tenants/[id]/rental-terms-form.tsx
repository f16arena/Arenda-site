"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { LockKeyhole, FileSignature } from "lucide-react"
import { toast } from "sonner"
import { updateTenantRentalTerms } from "@/app/actions/tenant"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { parseRentSchedule, type RentMode } from "@/lib/rent"
import { useLocale, useT } from "@/lib/i18n/client"
import { formatDateShortL, formatMoneyL } from "@/lib/i18n/format"

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
  /** Индексация аренды: % в год; null — без индексации. */
  indexationPct?: number | null
  /** YYYY-MM-DD: дата следующего автоповышения. */
  nextIndexationAt?: string | null
  /** Ступенчатая аренда (JSON-строка). Если задана — переопределяет ставку помесячно. */
  rentSchedule?: string | null
}

type Props = {
  tenantId: string
  locked: boolean
  lockedReason: string | null
  initial: RentalTermsInitial
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
  const { t } = useT()
  const locale = useLocale()
  const money = (amount: number) => formatMoneyL(locale, amount)
  const perMonth = t("common.money.perMonth")
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
        toast.success(t("adminTenants.rentalTerms.saved"))
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("adminTenants.rentalTerms.saveFailed"))
      }
    })
  }

  // ── Закреплено договором → только просмотр; изменения только через ДС. ──────────
  if (locked) {
    const mode = initialRentMode(initial)
    const methodLabel = mode === "FIXED"
      ? t("adminTenants.rentalTerms.modes.fixed")
      : mode === "RATE"
        ? t("adminTenants.rentalTerms.modes.rateLocked")
        : t("adminTenants.rentalTerms.modes.floor")
    const rentValue = mode === "FIXED"
      ? `${money(initial.fixedMonthlyRent ?? 0)}${perMonth}`
      : mode === "RATE"
        ? `${money(initial.customRate ?? 0)}/м²`
        : "—"
    return (
      <div className="p-5 space-y-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-2">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
              <div>
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">{t("adminTenants.rentalTerms.lockedTitle")}</p>
                <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-200">
                  {lockedReason ?? t("adminTenants.rentalTerms.lockedDefault")}
                </p>
              </div>
            </div>
            <Link
              href={`/admin/documents?create=addendum&tenantId=${tenantId}`}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-amber-900 px-3 py-2 text-xs font-medium text-white hover:bg-amber-800 dark:bg-amber-300 dark:text-amber-950 dark:hover:bg-amber-200"
            >
              <FileSignature className="h-3.5 w-3.5" />
              {t("adminTenants.rentalTerms.lockedAddendum")}
            </Link>
          </div>
        </div>

        <dl className="rounded-lg border border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-900">
          <Row label={t("adminTenants.rentalTerms.method")} value={methodLabel} />
          {mode !== "FLOOR" && <Row label={t("adminTenants.rentalTerms.rentValue")} value={rentValue} />}
          <Row
            label={t("adminTenants.rentalTerms.cleaning")}
            value={initial.needsCleaning ? `${money(initial.cleaningFee)}${perMonth}` : t("adminTenants.rentalTerms.cleaningNotNeeded")}
          />
          <Row
            label={t("adminTenants.rentalTerms.dueDay")}
            value={t("adminTenants.rentalTerms.dueDayValue", { day: initial.paymentDueDay })}
          />
          <Row
            label={t("adminTenants.rentalTerms.penalty")}
            value={initial.penaltyPercent > 0
              ? t("adminTenants.rentalTerms.penaltyValue", { percent: initial.penaltyPercent })
              : t("adminTenants.rentalTerms.penaltyNone")}
          />
          {typeof initial.depositAmount === "number" && initial.depositAmount > 0 && (
            <Row label={t("adminTenants.rentalTerms.deposit")} value={money(initial.depositAmount)} />
          )}
          {typeof initial.rentFreeMonths === "number" && initial.rentFreeMonths > 0 && (
            <Row
              label={t("adminTenants.rentalTerms.rentFree")}
              value={t("adminTenants.rentalTerms.rentFreeValue", { count: initial.rentFreeMonths })}
            />
          )}
          {initial.moveInDate && (
            <Row label={t("adminTenants.rentalTerms.moveInDate")} value={formatDateShortL(locale, initial.moveInDate)} />
          )}
          {typeof initial.indexationPct === "number" && initial.indexationPct > 0 && (
            <Row
              label={t("adminTenants.rentalTerms.indexationRow")}
              value={
                t("adminTenants.rentalTerms.indexationValue", { percent: initial.indexationPct }) +
                (initial.nextIndexationAt
                  ? t("adminTenants.rentalTerms.indexationNext", { date: formatDateShortL(locale, initial.nextIndexationAt) })
                  : "")
              }
            />
          )}
          {parseRentSchedule(initial.rentSchedule).length > 0 && (
            <div className="border-b border-slate-100 py-2 text-sm dark:border-slate-800 last:border-0">
              <dt className="mb-1 text-slate-500 dark:text-slate-400">{t("adminTenants.rentalTerms.scheduleTitle")}</dt>
              <dd>
                <ul className="space-y-0.5 text-right">
                  {parseRentSchedule(initial.rentSchedule).map((step) => (
                    <li key={step.from} className="font-medium tabular-nums text-slate-900 dark:text-slate-100">
                      {step.amount > 0
                        ? t("adminTenants.rentalTerms.scheduleRow", { from: step.from, amount: money(step.amount) })
                        : t("adminTenants.rentalTerms.scheduleFree", { from: step.from })}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          {t("adminTenants.rentalTerms.lockedFooter")}
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
          {t("adminTenants.rentalTerms.methodLegend")}
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {([
            ["FLOOR", "floor", "floorHint"],
            ["RATE", "rate", "rateHint"],
            ["FIXED", "fixed", "fixedHint"],
          ] as const).map(([mode, labelKey, hintKey]) => (
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
              <span>{t(`adminTenants.rentalTerms.modes.${labelKey}`)}</span>
              <span className="mt-0.5 text-[11px] font-normal text-slate-500 dark:text-slate-400">
                {t(`adminTenants.rentalTerms.modes.${hintKey}`)}
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
          {t("adminTenants.rentalTerms.methodFooter")}
        </p>
      </fieldset>

      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminTenants.rentalTerms.customRate")}</label>
        <Input
          name="customRate"
          type="number"
          step="0.01"
          min={0}
          value={customRate}
          onChange={(event) => setCustomRate(event.target.value)}
          placeholder={t("adminTenants.rentalTerms.customRatePlaceholder")}
          disabled={pending || rentMode !== "RATE"}
          required={rentMode === "RATE"}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminTenants.rentalTerms.fixedRent")}</label>
        <Input
          name="fixedMonthlyRent"
          type="number"
          step="0.01"
          min={0}
          value={fixedMonthlyRent}
          onChange={(event) => setFixedMonthlyRent(event.target.value)}
          placeholder={t("adminTenants.rentalTerms.fixedRentPlaceholder")}
          disabled={pending || rentMode !== "FIXED"}
          required={rentMode === "FIXED"}
        />
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          {t("adminTenants.rentalTerms.fixedRentHint")}
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          {t("adminTenants.rentalTerms.moveInDate")}
        </label>
        <Input
          name="moveInDate"
          type="date"
          defaultValue={initial.moveInDate ?? ""}
          disabled={pending}
        />
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          {t("adminTenants.rentalTerms.moveInHint")}
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          {t("adminTenants.rentalTerms.rentFreeField")}
        </label>
        <Input
          name="rentFreeMonths"
          type="number"
          min={0}
          max={24}
          step={1}
          defaultValue={initial.rentFreeMonths ?? 0}
          disabled={pending}
          placeholder="0"
        />
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          {t("adminTenants.rentalTerms.rentFreeHint")}
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          {t("adminTenants.rentalTerms.depositField")}
        </label>
        <Input
          name="depositAmount"
          type="number"
          min={0}
          step="0.01"
          defaultValue={initial.depositAmount ?? ""}
          disabled={pending}
          placeholder={t("adminTenants.rentalTerms.depositPlaceholder")}
        />
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          {t("adminTenants.rentalTerms.depositHint")}
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">{t("adminTenants.rentalTerms.cleaningFee")}</label>
        <Input
          name="cleaningFee"
          type="number"
          step="0.01"
          defaultValue={initial.cleaningFee}
          disabled={pending}
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
          {t("adminTenants.rentalTerms.needsCleaning")}
        </label>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          {t("adminTenants.rentalTerms.dueDayField")}
        </label>
        <Input
          name="paymentDueDay"
          type="number"
          min={1}
          max={31}
          defaultValue={initial.paymentDueDay}
          disabled={pending}
        />
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          {t("adminTenants.rentalTerms.dueDayHint")}
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          {t("adminTenants.rentalTerms.penaltyField")}
        </label>
        <Input
          name="penaltyPercent"
          type="number"
          step="0.1"
          min={0}
          max={100}
          defaultValue={initial.penaltyPercent}
          disabled={pending}
        />
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          {t("adminTenants.rentalTerms.penaltyHint")}
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          {t("adminTenants.rentalTerms.indexationField")}
        </label>
        <Input
          name="indexationPct"
          type="number"
          step="0.1"
          min={0}
          max={100}
          defaultValue={initial.indexationPct ?? ""}
          disabled={pending}
          placeholder={t("adminTenants.rentalTerms.indexationPlaceholder")}
        />
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          {t("adminTenants.rentalTerms.indexationHint")}
        </p>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          {t("adminTenants.rentalTerms.nextIndexation")}
        </label>
        <Input
          name="nextIndexationAt"
          type="date"
          defaultValue={initial.nextIndexationAt ?? ""}
          disabled={pending}
        />
        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
          {t("adminTenants.rentalTerms.nextIndexationHint")}
        </p>
      </div>

      <div className="md:col-span-3 flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? t("common.actions.saving") : t("common.actions.save")}
        </Button>
      </div>
    </form>
  )
}
