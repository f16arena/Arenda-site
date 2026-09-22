"use client"

import { FIELD_CLS, LABEL_CLS } from "@/lib/ui-fields"
import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Check, ChevronLeft, ChevronRight, FileSignature, Loader2, UserPlus } from "lucide-react"
import { createTenant } from "@/app/actions/tenant-create"
import { updateTenantRentalTerms } from "@/app/actions/tenant"
import { KzPhoneInput, AsciiEmailInput } from "@/components/forms/contact-inputs"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { TenantIdentityFields } from "../tenant-identity-fields"
import { useLocale, useT } from "@/lib/i18n/client"
import { formatMoneyL } from "@/lib/i18n/format"

type WizardSpace = {
  id: string
  number: string
  area: number
  floorName: string
  ratePerSqm: number
  buildingId: string
  buildingName: string
}

const inputCls = FIELD_CLS
const labelCls = LABEL_CLS

/** Поля, которые после создания арендатора уходят в updateTenantRentalTerms. */
const RENTAL_TERMS_FIELDS = [
  "rentMode", "customRate", "fixedMonthlyRent", "cleaningFee", "needsCleaning",
  "paymentDueDay", "penaltyPercent", "rentFreeMonths", "depositAmount",
  "moveInDate", "indexationPct", "nextIndexationAt",
] as const

export function TenantWizard({
  vacantSpaces,
  initialSpaceId,
  onClose,
}: {
  vacantSpaces: WizardSpace[]
  initialSpaceId?: string
  /** Задан — мастер открыт в окне: есть кнопка «Закрыть», без заголовка страницы */
  onClose?: () => void
}) {
  const { t } = useT()
  const locale = useLocale()
  const money = (amount: number) => formatMoneyL(locale, amount)
  const formRef = useRef<HTMLFormElement>(null)
  const [step, setStep] = useState(0)
  const [pending, startTransition] = useTransition()
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null)
  // Название компании запоминаем отдельно: экран «готово» больше не ищет его
  // по подписи строки сводки (подпись переводится и меняется вместе с языком).
  const [createdCompany, setCreatedCompany] = useState("")

  const steps = [
    t("adminTenants.wizard.steps.contacts"),
    t("adminTenants.wizard.steps.space"),
    t("adminTenants.wizard.steps.review"),
  ]
  const stepHints: string[][] = [
    [
      t("adminTenants.wizard.hints.contacts1"),
      t("adminTenants.wizard.hints.contacts2"),
      t("adminTenants.wizard.hints.contacts3"),
    ],
    [
      t("adminTenants.wizard.hints.space1"),
      t("adminTenants.wizard.hints.space2"),
      t("adminTenants.wizard.hints.space3"),
    ],
    [
      t("adminTenants.wizard.hints.review1"),
      t("adminTenants.wizard.hints.review2"),
    ],
  ]
  const outcome: [string, string][] = [
    [t("adminTenants.wizard.outcome.cardTitle"), t("adminTenants.wizard.outcome.cardSub")],
    [t("adminTenants.wizard.outcome.spaceTitle"), t("adminTenants.wizard.outcome.spaceSub")],
    [t("adminTenants.wizard.outcome.contractTitle"), t("adminTenants.wizard.outcome.contractSub")],
  ]

  // Предвыбранное помещение (вход «Заселить» со свободного помещения).
  const preset = initialSpaceId ? vacantSpaces.find((s) => s.id === initialSpaceId) : undefined

  // Шаг 2: здание → помещения, способ расчёта аренды.
  const buildings = [...new Map(vacantSpaces.map((s) => [s.buildingId, s.buildingName])).entries()]
  const [buildingFilter, setBuildingFilter] = useState<string>(preset?.buildingId ?? buildings[0]?.[0] ?? "")
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>(preset ? [preset.id] : [])
  const [rentMode, setRentMode] = useState<"FLOOR" | "RATE" | "FIXED">("FLOOR")
  const selectedSpaces = vacantSpaces.filter((s) => selectedSpaceIds.includes(s.id))
  const selectedArea = selectedSpaces.reduce((sum, s) => sum + s.area, 0)
  const floorRent = selectedSpaces.reduce((sum, s) => sum + s.area * s.ratePerSqm, 0)

  function fd(): FormData {
    return new FormData(formRef.current ?? undefined)
  }

  function validateStep(current: number): string | null {
    const data = fd()
    if (current === 0) {
      if (!String(data.get("name") ?? "").trim()) return t("adminTenants.wizard.errors.name")
      if (!String(data.get("phone") ?? "").trim()) return t("adminTenants.wizard.errors.phone")
      if (!String(data.get("companyName") ?? "").trim()) return t("adminTenants.wizard.errors.company")
    }
    if (current === 1) {
      if (rentMode === "RATE" && !String(data.get("customRate") ?? "").trim()) return t("adminTenants.wizard.errors.rate")
      if (rentMode === "FIXED" && !String(data.get("fixedMonthlyRent") ?? "").trim()) return t("adminTenants.wizard.errors.fixed")
      if (rentMode === "FLOOR" && selectedSpaceIds.length === 0) return t("adminTenants.wizard.errors.space")
    }
    return null
  }

  const [summary, setSummary] = useState<[string, string][]>([])

  function buildSummary(): [string, string][] {
    const data = fd()
    const v = (k: string) => String(data.get(k) ?? "").trim()
    const rentLabel = rentMode === "FIXED"
      ? t("adminTenants.wizard.summary.rentFixed", { amount: money(Number(v("fixedMonthlyRent")) || 0) })
      : rentMode === "RATE"
        ? t("adminTenants.wizard.summary.rentRate", { amount: money(Number(v("customRate")) || 0) })
        : floorRent > 0
          ? t("adminTenants.wizard.summary.rentFloorSum", { amount: money(floorRent) })
          : t("adminTenants.wizard.summary.rentFloor")
    return [
      [t("adminTenants.wizard.summary.contact"), `${v("name")} · ${v("phone")}${v("email") ? ` · ${v("email")}` : ""}`],
      [t("adminTenants.wizard.summary.company"), `${v("companyName")} (${v("legalType") || "IP"})`],
      [
        t("adminTenants.wizard.summary.spaces"),
        selectedSpaces.length > 0
          ? selectedSpaces.map((s) => `${t("adminTenants.table.spaceLabel", { number: s.number })} (${s.buildingName})`).join(", ")
          : t("adminTenants.wizard.summary.noSpace"),
      ],
      [t("adminTenants.wizard.summary.rent"), rentLabel],
      [t("adminTenants.wizard.summary.dueDay"), t("adminTenants.wizard.summary.dueDayValue", { day: v("paymentDueDay") || "10" })],
      [
        t("adminTenants.wizard.summary.deposit"),
        v("depositAmount") ? money(Number(v("depositAmount"))) : t("adminTenants.wizard.summary.depositDefault"),
      ],
      [
        t("adminTenants.wizard.summary.term"),
        v("contractStart") || v("contractEnd")
          ? `${v("contractStart") || "—"} → ${v("contractEnd") || "—"}`
          : t("adminTenants.wizard.summary.noTerm"),
      ],
    ]
  }

  function next() {
    const err = validateStep(step)
    if (err) { toast.error(err); return }
    if (step === 1) setSummary(buildSummary())
    setStep((s) => Math.min(s + 1, 2))
  }

  function submit() {
    const err = validateStep(0) ?? validateStep(1)
    if (err) { toast.error(err); return }
    startTransition(async () => {
      try {
        const data = fd()
        // 1) Создание арендатора (пользователь + компания + помещения + welcome).
        const result = await createTenant(data)
        if (!result.success) { toast.error(result.error); return }
        const tenantId = result.tenantId

        // 2) Условия аренды — той же формой, повторно ничего не вводим.
        const terms = new FormData()
        for (const key of RENTAL_TERMS_FIELDS) {
          const value = data.get(key)
          if (value !== null) terms.set(key, value)
        }
        await updateTenantRentalTerms(tenantId, terms)

        // Сводка — из того, что реально ушло в базу (шаг 3 мог быть пропущен).
        setSummary(buildSummary())
        setCreatedCompany(String(data.get("companyName") ?? "").trim())
        setCreatedTenantId(tenantId)
        window.scrollTo({ top: 0 })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t("adminTenants.wizard.errors.failed"))
      }
    })
  }

  // ── Готово: что сохранили + следующий шаг (договор) ─────────────────────
  if (createdTenantId) {
    const company = createdCompany || t("adminTenants.wizard.done.fallbackCompany")
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
            <Check className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-slate-900 dark:text-slate-100 sm:text-2xl">
              {t("adminTenants.wizard.done.title", { company })}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("adminTenants.wizard.done.subtitle")}</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* Что сохранили */}
          <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:col-span-3">
            <h2 className="border-b border-slate-100 px-5 py-3.5 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">
              {t("adminTenants.wizard.done.savedTitle")}
            </h2>
            <dl className="divide-y divide-slate-100 dark:divide-slate-800">
              {summary.map(([k, val]) => (
                <div key={k} className="grid grid-cols-[120px_1fr] gap-3 px-5 py-2.5 text-sm">
                  <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
                  <dd className="min-w-0 break-words font-medium text-slate-900 dark:text-slate-100">{val}</dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-slate-100 px-5 py-3 dark:border-slate-800">
              <Link href={`/admin/tenants/${createdTenantId}`} className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
                {t("adminTenants.wizard.done.openCard")}
              </Link>
            </div>
          </section>

          {/* Следующий шаг */}
          <section className="flex flex-col rounded-2xl border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-500/30 dark:bg-blue-500/5 lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              {t("adminTenants.wizard.done.nextStep")}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t("adminTenants.wizard.done.contractTitle")}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {t("adminTenants.wizard.done.contractText")}
            </p>
            <Link
              href={`/admin/documents?create=contract&tenantId=${createdTenantId}`}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <FileSignature className="h-4 w-4" />
              {t("adminTenants.wizard.done.createContract")}
            </Link>
            <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-5 text-sm">
              {/* Полная перезагрузка: мастер начинается с чистой формы */}
              <button type="button" onClick={() => window.location.assign("/admin/tenants/new")} className="text-slate-600 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-slate-100">
                {t("adminTenants.wizard.done.oneMore")}
              </button>
              <Link href="/admin/tenants" className="text-slate-600 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-slate-100">
                {t("adminTenants.wizard.done.toList")}
              </Link>
            </div>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {!onClose && (
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          <UserPlus className="h-6 w-6 text-slate-400" />
          {t("adminTenants.wizard.title")}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {t("adminTenants.wizard.subtitle")}
        </p>
      </div>
      )}

      {/* Прогресс */}
      <div className="flex items-center gap-2">
        {steps.map((title, i) => (
          <div key={title} className="flex flex-1 items-center gap-2">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              i < step ? "bg-emerald-500 text-white" : i === step ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-200 text-slate-500 dark:bg-slate-800"}`}>
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={`hidden text-xs sm:block ${i === step ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`}>
              {title}
            </span>
            {i < steps.length - 1 && <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />}
          </div>
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* Одна форма на все шаги: скрытые шаги остаются в DOM, данные не теряются. */}
      <Card className="block p-6">
      <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
        {/* ── Шаг 1: контакты и компания ── */}
        <div className={step === 0 ? "space-y-4" : "hidden"}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {t("adminTenants.wizard.contactSection")}
          </p>
          <div>
            <label className={labelCls}>{t("adminTenants.wizard.fullName")}</label>
            <Input name="name" placeholder={t("adminTenants.wizard.fullNamePlaceholder")} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>{t("adminTenants.wizard.phone")}</label>
              <KzPhoneInput name="phone" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t("adminTenants.wizard.email")}</label>
              <AsciiEmailInput name="email" className={inputCls} />
            </div>
          </div>
          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {t("adminTenants.wizard.companySection")}
          </p>
          <div>
            <label className={labelCls}>{t("adminTenants.wizard.companyName")}</label>
            <Input name="companyName" placeholder={t("adminTenants.wizard.companyNamePlaceholder")} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TenantIdentityFields />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>{t("adminTenants.wizard.category")}</label>
              <Input name="category" placeholder={t("adminTenants.wizard.categoryPlaceholder")} />
            </div>
            <div>
              <label className={labelCls}>{t("adminTenants.wizard.legalAddress")}</label>
              <Input name="legalAddress" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-5 pt-1">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" name="sendWelcome" defaultChecked /> {t("adminTenants.wizard.sendWelcome")}
            </label>
          </div>
        </div>

        {/* ── Шаг 2: помещение и условия ── */}
        <div className={step === 1 ? "space-y-4" : "hidden"}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {t("adminTenants.wizard.spaceSection")}
          </p>
          {vacantSpaces.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("adminTenants.wizard.noVacant")}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {buildings.map(([id, name]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setBuildingFilter(id)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${buildingFilter === id ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" : "border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400"}`}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {vacantSpaces.filter((s) => s.buildingId === buildingFilter).map((s) => {
                  const checked = selectedSpaceIds.includes(s.id)
                  return (
                    <label
                      key={s.id}
                      className={`cursor-pointer rounded-lg border p-2.5 text-sm ${checked ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10" : "border-slate-200 dark:border-slate-800"}`}
                    >
                      <input
                        type="checkbox"
                        name="spaceIds"
                        value={s.id}
                        checked={checked}
                        onChange={() =>
                          setSelectedSpaceIds((cur) => checked ? cur.filter((x) => x !== s.id) : [...cur, s.id])
                        }
                        className="sr-only"
                      />
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {t("adminTenants.table.spaceLabel", { number: s.number })}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{s.floorName} · {s.area} м² · {money(s.ratePerSqm)}/м²</p>
                    </label>
                  )
                })}
              </div>
              {selectedSpaces.length > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("adminTenants.wizard.selected", {
                    spaces: selectedSpaces.map((s) => t("adminTenants.table.spaceLabel", { number: s.number })).join(", "),
                    area: selectedArea,
                  })}
                  {rentMode === "FLOOR" && floorRent > 0
                    ? t("adminTenants.wizard.selectedRent", { amount: money(floorRent) })
                    : ""}
                </p>
              )}
            </>
          )}

          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {t("adminTenants.wizard.rentSection")}
          </p>
          <input type="hidden" name="rentMode" value={rentMode} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {([
              ["FLOOR", t("adminTenants.wizard.rentModes.floor")],
              ["RATE", t("adminTenants.wizard.rentModes.rate")],
              ["FIXED", t("adminTenants.wizard.rentModes.fixed")],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setRentMode(mode)}
                className={`rounded-lg border px-3 py-2 text-sm ${rentMode === mode ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" : "border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-400"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {rentMode === "RATE" && (
              <div>
                <label className={labelCls}>{t("adminTenants.wizard.rate")}</label>
                <Input name="customRate" type="number" step="0.01" min={0} />
              </div>
            )}
            {rentMode === "FIXED" && (
              <div>
                <label className={labelCls}>{t("adminTenants.wizard.fixedRent")}</label>
                <Input name="fixedMonthlyRent" type="number" step="0.01" min={0} />
              </div>
            )}
            <div>
              <label className={labelCls}>{t("adminTenants.wizard.dueDay")}</label>
              <Input name="paymentDueDay" type="number" min={1} max={31} defaultValue={10} />
            </div>
            <div>
              <label className={labelCls}>{t("adminTenants.wizard.deposit")}</label>
              <Input name="depositAmount" type="number" min={0} step="0.01" placeholder={t("adminTenants.wizard.depositPlaceholder")} />
            </div>
            <div>
              <label className={labelCls}>{t("adminTenants.wizard.penalty")}</label>
              <Input name="penaltyPercent" type="number" step="0.1" min={0} max={100} defaultValue={0.5} />
            </div>
            <div>
              <label className={labelCls}>{t("adminTenants.wizard.rentFree")}</label>
              <Input name="rentFreeMonths" type="number" min={0} max={24} defaultValue={0} />
            </div>
            <div>
              <label className={labelCls}>{t("adminTenants.wizard.indexation")}</label>
              <Input name="indexationPct" type="number" step="0.1" min={0} max={100} placeholder={t("adminTenants.wizard.indexationPlaceholder")} />
            </div>
          </div>

          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {t("adminTenants.wizard.termSection")}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={labelCls}>{t("adminTenants.wizard.contractStart")}</label>
              <Input name="contractStart" type="date" />
            </div>
            <div>
              <label className={labelCls}>{t("adminTenants.wizard.contractEnd")}</label>
              <Input name="contractEnd" type="date" />
            </div>
            <div>
              <label className={labelCls}>{t("adminTenants.wizard.moveInDate")}</label>
              <Input name="moveInDate" type="date" />
            </div>
            <div>
              <label className={labelCls}>{t("adminTenants.wizard.nextIndexation")}</label>
              <Input name="nextIndexationAt" type="date" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" name="needsCleaning" /> {t("adminTenants.wizard.cleaning")}
            </label>
            <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <Input name="cleaningFee" type="number" min={0} step="0.01" placeholder={t("adminTenants.wizard.cleaningPlaceholder")} className="w-28" />
            </div>
          </div>
        </div>

        {/* ── Шаг 3: проверка ── */}
        <div className={step === 2 ? "space-y-3" : "hidden"}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t("adminTenants.wizard.reviewText")}
          </p>
          <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {summary.map(([k, val]) => (
              <div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
                <dd className="text-right font-medium text-slate-900 dark:text-slate-100">{val}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Навигация */}
        <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || pending}
            >
              <ChevronLeft className="h-4 w-4" /> {t("common.actions.back")}
            </Button>
            {onClose && (
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                {t("common.actions.close")}
              </Button>
            )}
          </div>
          {step < 2 ? (
            <Button type="button" onClick={next}>
              {t("adminTenants.wizard.next")} <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {pending ? t("adminTenants.wizard.submitting") : t("adminTenants.wizard.submit")}
            </button>
          )}
        </div>
      </form>
      </Card>

      {/* Справа — подсказка к текущему шагу и что будет дальше */}
      <aside className="space-y-4 lg:sticky lg:top-20">
        <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-500/30 dark:bg-blue-500/5">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            {t("adminTenants.wizard.stepOf", { step: step + 1 })}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{steps[step]}</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
            {stepHints[step].map((h) => (
              <li key={h} className="flex gap-2"><span className="text-blue-500">•</span><span>{h}</span></li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminTenants.wizard.outcomeTitle")}</p>
          <ol className="mt-3 space-y-3">
            {outcome.map(([title, sub], i) => (
              <li key={title} className="flex gap-3">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  i < step ? "bg-emerald-500 text-white" : i === step ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{sub}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </aside>
      </div>
    </div>
  )
}
