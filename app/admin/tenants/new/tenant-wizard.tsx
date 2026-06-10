"use client"

import { useRef, useState, useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Check, ChevronLeft, ChevronRight, FileSignature, Loader2, UserPlus } from "lucide-react"
import { createTenant } from "@/app/actions/tenant-create"
import { updateTenantRentalTerms } from "@/app/actions/tenant"
import { KzPhoneInput, AsciiEmailInput } from "@/components/forms/contact-inputs"
import { TenantIdentityFields } from "../tenant-identity-fields"
import { KZ_VAT_RATE_OPTIONS, DEFAULT_KZ_VAT_RATE } from "@/lib/kz-vat"
import { formatMoney } from "@/lib/utils"

type WizardSpace = {
  id: string
  number: string
  area: number
  floorName: string
  ratePerSqm: number
  buildingId: string
  buildingName: string
}

const inputCls =
  "w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
const labelCls = "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5"

const STEPS = ["Контакты и компания", "Помещение и условия", "Проверка и создание"] as const

/** Поля, которые после создания арендатора уходят в updateTenantRentalTerms. */
const RENTAL_TERMS_FIELDS = [
  "rentMode", "customRate", "fixedMonthlyRent", "cleaningFee", "needsCleaning",
  "paymentDueDay", "penaltyPercent", "rentFreeMonths", "depositAmount",
  "moveInDate", "indexationPct", "nextIndexationAt",
] as const

export function TenantWizard({ vacantSpaces }: { vacantSpaces: WizardSpace[] }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [step, setStep] = useState(0)
  const [pending, startTransition] = useTransition()
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null)

  // Шаг 2: здание → помещения, способ расчёта аренды.
  const buildings = [...new Map(vacantSpaces.map((s) => [s.buildingId, s.buildingName])).entries()]
  const [buildingFilter, setBuildingFilter] = useState<string>(buildings[0]?.[0] ?? "")
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<string[]>([])
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
      if (!String(data.get("name") ?? "").trim()) return "Введите ФИО контактного лица"
      if (!String(data.get("phone") ?? "").trim()) return "Введите телефон"
      if (!String(data.get("companyName") ?? "").trim()) return "Введите название компании"
    }
    if (current === 1) {
      if (rentMode === "RATE" && !String(data.get("customRate") ?? "").trim()) return "Укажите ставку ₸/м²"
      if (rentMode === "FIXED" && !String(data.get("fixedMonthlyRent") ?? "").trim()) return "Укажите сумму аренды в месяц"
      if (rentMode === "FLOOR" && selectedSpaceIds.length === 0) return "Выберите помещение или укажите индивидуальную ставку/сумму"
    }
    return null
  }

  const [summary, setSummary] = useState<[string, string][]>([])

  function buildSummary(): [string, string][] {
    const data = fd()
    const v = (k: string) => String(data.get(k) ?? "").trim()
    const rentLabel = rentMode === "FIXED"
      ? `${formatMoney(Number(v("fixedMonthlyRent")) || 0)}/мес (фикс.)`
      : rentMode === "RATE"
        ? `${formatMoney(Number(v("customRate")) || 0)}/м²`
        : floorRent > 0 ? `по ставкам этажей ≈ ${formatMoney(floorRent)}/мес` : "по ставке этажа"
    return [
      ["Контакт", `${v("name")} · ${v("phone")}${v("email") ? ` · ${v("email")}` : ""}`],
      ["Компания", `${v("companyName")} (${v("legalType") || "ИП"})`],
      ["Помещения", selectedSpaces.length > 0 ? selectedSpaces.map((s) => `Каб. ${s.number} (${s.buildingName})`).join(", ") : "без помещения"],
      ["Аренда", rentLabel],
      ["День оплаты", `${v("paymentDueDay") || "10"} числа`],
      ["Депозит", v("depositAmount") ? formatMoney(Number(v("depositAmount"))) : "= 1 мес. аренды"],
      ["Срок", v("contractStart") || v("contractEnd") ? `${v("contractStart") || "—"} → ${v("contractEnd") || "—"}` : "не указан"],
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
        const tenantId = (result as { tenantId?: string })?.tenantId
        if (!tenantId) throw new Error("Арендатор создан, но не удалось получить его ID")

        // 2) Условия аренды — той же формой, повторно ничего не вводим.
        const terms = new FormData()
        for (const key of RENTAL_TERMS_FIELDS) {
          const value = data.get(key)
          if (value !== null) terms.set(key, value)
        }
        await updateTenantRentalTerms(tenantId, terms)

        setCreatedTenantId(tenantId)
        toast.success("Арендатор создан, условия аренды сохранены")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось создать арендатора")
      }
    })
  }

  // ── Готово: ссылки на договор и карточку ───────────────────────────────
  if (createdTenantId) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-8 text-center dark:border-emerald-500/30 dark:bg-emerald-500/5">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20">
          <Check className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Арендатор заселён</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
          Контакты, помещение и условия аренды сохранены. Остался последний шаг — договор:
          конструктор уже заполнит его данными арендатора.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href={`/admin/documents?create=contract&tenantId=${createdTenantId}`}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
          >
            <FileSignature className="h-4 w-4" />
            Создать договор
          </Link>
          <Link
            href={`/admin/tenants/${createdTenantId}`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-300"
          >
            Открыть карточку
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
          <UserPlus className="h-6 w-6 text-slate-400" />
          Мастер заселения
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Три шага: контакты → помещение и условия → договор. Без повторного ввода данных.
        </p>
      </div>

      {/* Прогресс */}
      <div className="flex items-center gap-2">
        {STEPS.map((title, i) => (
          <div key={title} className="flex flex-1 items-center gap-2">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              i < step ? "bg-emerald-500 text-white" : i === step ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-200 text-slate-500 dark:bg-slate-800"}`}>
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={`hidden text-xs sm:block ${i === step ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`}>
              {title}
            </span>
            {i < STEPS.length - 1 && <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />}
          </div>
        ))}
      </div>

      {/* Одна форма на все шаги: скрытые шаги остаются в DOM, данные не теряются. */}
      <form ref={formRef} onSubmit={(e) => e.preventDefault()} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        {/* ── Шаг 1: контакты и компания ── */}
        <div className={step === 0 ? "space-y-4" : "hidden"}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Контактное лицо</p>
          <div>
            <label className={labelCls}>ФИО *</label>
            <input name="name" className={inputCls} placeholder="Иванов Иван Иванович" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Телефон *</label>
              <KzPhoneInput name="phone" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <AsciiEmailInput name="email" className={inputCls} />
            </div>
          </div>
          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Компания</p>
          <div>
            <label className={labelCls}>Название компании *</label>
            <input name="companyName" className={inputCls} placeholder="ТОО «Ромашка» / ИП Иванов" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TenantIdentityFields />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Вид деятельности</label>
              <input name="category" className={inputCls} placeholder="розничная торговля, офис…" />
            </div>
            <div>
              <label className={labelCls}>Юридический адрес</label>
              <input name="legalAddress" className={inputCls} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-5 pt-1">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" name="isVatPayer" /> Плательщик НДС
            </label>
            <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              Ставка НДС:
              <select name="vatRate" defaultValue={DEFAULT_KZ_VAT_RATE} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-800 dark:bg-slate-900">
                {KZ_VAT_RATE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" name="sendWelcome" defaultChecked /> Отправить доступы в кабинет на email
            </label>
          </div>
        </div>

        {/* ── Шаг 2: помещение и условия ── */}
        <div className={step === 1 ? "space-y-4" : "hidden"}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Помещение</p>
          {vacantSpaces.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Свободных помещений нет — арендатора можно создать без помещения и назначить его позже.</p>
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
                      <p className="font-medium text-slate-900 dark:text-slate-100">Каб. {s.number}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{s.floorName} · {s.area} м² · {formatMoney(s.ratePerSqm)}/м²</p>
                    </label>
                  )
                })}
              </div>
              {selectedSpaces.length > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Выбрано: {selectedSpaces.map((s) => `Каб. ${s.number}`).join(", ")} · {selectedArea} м²
                  {rentMode === "FLOOR" && floorRent > 0 ? ` · аренда по ставкам этажей ≈ ${formatMoney(floorRent)}/мес` : ""}
                </p>
              )}
            </>
          )}

          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Аренда</p>
          <input type="hidden" name="rentMode" value={rentMode} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {([
              ["FLOOR", "По ставке этажа"],
              ["RATE", "Своя ставка ₸/м²"],
              ["FIXED", "Фикс. сумма/мес"],
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
                <label className={labelCls}>Ставка ₸/м² *</label>
                <input name="customRate" type="number" step="0.01" min={0} className={inputCls} />
              </div>
            )}
            {rentMode === "FIXED" && (
              <div>
                <label className={labelCls}>Аренда ₸/мес *</label>
                <input name="fixedMonthlyRent" type="number" step="0.01" min={0} className={inputCls} />
              </div>
            )}
            <div>
              <label className={labelCls}>День оплаты</label>
              <input name="paymentDueDay" type="number" min={1} max={31} defaultValue={10} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Депозит ₸</label>
              <input name="depositAmount" type="number" min={0} step="0.01" className={inputCls} placeholder="= 1 мес. аренды" />
            </div>
            <div>
              <label className={labelCls}>Пеня % в день</label>
              <input name="penaltyPercent" type="number" step="0.1" min={0} max={100} defaultValue={0.5} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Каникулы, мес.</label>
              <input name="rentFreeMonths" type="number" min={0} max={24} defaultValue={0} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Индексация, %/год</label>
              <input name="indexationPct" type="number" step="0.1" min={0} max={100} className={inputCls} placeholder="0 = нет" />
            </div>
          </div>

          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Срок</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={labelCls}>Начало договора</label>
              <input name="contractStart" type="date" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Окончание</label>
              <input name="contractEnd" type="date" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Дата заселения</label>
              <input name="moveInDate" type="date" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Следующая индексация</label>
              <input name="nextIndexationAt" type="date" className={inputCls} />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" name="needsCleaning" /> Уборка помещения
            </label>
            <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input name="cleaningFee" type="number" min={0} step="0.01" placeholder="₸/мес" className={`${inputCls} w-28`} />
            </div>
          </div>
        </div>

        {/* ── Шаг 3: проверка ── */}
        <div className={step === 2 ? "space-y-3" : "hidden"}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Проверьте данные и нажмите «Создать». После создания конструктор договора
            заполнится автоматически — останется проверить текст и отправить на подпись.
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
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 disabled:opacity-40 dark:border-slate-800 dark:text-slate-400"
          >
            <ChevronLeft className="h-4 w-4" /> Назад
          </button>
          {step < 2 ? (
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
            >
              Далее <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {pending ? "Создаю…" : "Создать арендатора"}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

