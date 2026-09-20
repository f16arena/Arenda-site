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

const inputCls = FIELD_CLS
const labelCls = LABEL_CLS

const STEPS = ["Контакты и компания", "Помещение и условия", "Проверка и создание"] as const

const STEP_HINTS: string[][] = [
  [
    "Обязательно только ФИО, телефон и название компании.",
    "По ИИН/БИН статус НДС подтянется из КГД сам.",
    "Если указать email — арендатор получит доступ в личный кабинет.",
  ],
  [
    "Выберите свободное помещение — аренда посчитается по ставке этажа.",
    "Киоск, антенна, место без помещения — «Фикс. сумма/мес».",
    "Сроки и депозит можно не заполнять сейчас — их задаст договор.",
  ],
  [
    "Проверьте сводку — всё можно поправить кнопкой «Назад».",
    "После создания сразу откроется путь к договору.",
  ],
]

const OUTCOME: [string, string][] = [
  ["Карточка арендатора", "контакты, реквизиты, НДС"],
  ["Помещение и аренда", "занятость, начисления каждый месяц"],
  ["Договор", "конструктор заполнит его сам — останется подписать"],
]

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
  const formRef = useRef<HTMLFormElement>(null)
  const [step, setStep] = useState(0)
  const [pending, startTransition] = useTransition()
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null)

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
        setCreatedTenantId(tenantId)
        window.scrollTo({ top: 0 })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Не удалось создать арендатора")
      }
    })
  }

  // ── Готово: что сохранили + следующий шаг (договор) ─────────────────────
  if (createdTenantId) {
    const company = summary.find(([k]) => k === "Компания")?.[1]?.replace(/\s*\([^)]*\)$/, "") ?? "Арендатор"
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
            <Check className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-slate-900 dark:text-slate-100 sm:text-2xl">{company} заселён</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Карточка создана, условия аренды сохранены. Осталось оформить договор.</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* Что сохранили */}
          <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:col-span-3">
            <h2 className="border-b border-slate-100 px-5 py-3.5 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">Что сохранили</h2>
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
                Открыть карточку и поправить →
              </Link>
            </div>
          </section>

          {/* Следующий шаг */}
          <section className="flex flex-col rounded-2xl border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-500/30 dark:bg-blue-500/5 lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Следующий шаг</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">Договор аренды</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Конструктор сам подставит реквизиты, помещение, сумму и срок — останется проверить и отправить на подпись.
            </p>
            <Link
              href={`/admin/documents?create=contract&tenantId=${createdTenantId}`}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <FileSignature className="h-4 w-4" />
              Создать договор
            </Link>
            <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-5 text-sm">
              {/* Полная перезагрузка: мастер начинается с чистой формы */}
              <button type="button" onClick={() => window.location.assign("/admin/tenants/new")} className="text-slate-600 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-slate-100">Заселить ещё одного</button>
              <Link href="/admin/tenants" className="text-slate-600 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-slate-100">К списку арендаторов</Link>
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
          Мастер заселения
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Три шага: контакты → помещение и условия → договор. Без повторного ввода данных.
        </p>
      </div>
      )}

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

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      {/* Одна форма на все шаги: скрытые шаги остаются в DOM, данные не теряются. */}
      <Card className="block p-6">
      <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
        {/* ── Шаг 1: контакты и компания ── */}
        <div className={step === 0 ? "space-y-4" : "hidden"}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Контактное лицо</p>
          <div>
            <label className={labelCls}>ФИО *</label>
            <Input name="name" placeholder="Иванов Иван Иванович" />
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
            <Input name="companyName" placeholder="ТОО «Ромашка» / ИП Иванов" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TenantIdentityFields />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Вид деятельности</label>
              <Input name="category" placeholder="розничная торговля, офис…" />
            </div>
            <div>
              <label className={labelCls}>Юридический адрес</label>
              <Input name="legalAddress" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-5 pt-1">
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
                <Input name="customRate" type="number" step="0.01" min={0} />
              </div>
            )}
            {rentMode === "FIXED" && (
              <div>
                <label className={labelCls}>Аренда ₸/мес *</label>
                <Input name="fixedMonthlyRent" type="number" step="0.01" min={0} />
              </div>
            )}
            <div>
              <label className={labelCls}>День оплаты</label>
              <Input name="paymentDueDay" type="number" min={1} max={31} defaultValue={10} />
            </div>
            <div>
              <label className={labelCls}>Депозит ₸</label>
              <Input name="depositAmount" type="number" min={0} step="0.01" placeholder="= 1 мес. аренды" />
            </div>
            <div>
              <label className={labelCls}>Пеня % в день</label>
              <Input name="penaltyPercent" type="number" step="0.1" min={0} max={100} defaultValue={0.5} />
            </div>
            <div>
              <label className={labelCls}>Каникулы, мес.</label>
              <Input name="rentFreeMonths" type="number" min={0} max={24} defaultValue={0} />
            </div>
            <div>
              <label className={labelCls}>Индексация, %/год</label>
              <Input name="indexationPct" type="number" step="0.1" min={0} max={100} placeholder="0 = нет" />
            </div>
          </div>

          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Срок</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className={labelCls}>Начало договора</label>
              <Input name="contractStart" type="date" />
            </div>
            <div>
              <label className={labelCls}>Окончание</label>
              <Input name="contractEnd" type="date" />
            </div>
            <div>
              <label className={labelCls}>Дата заселения</label>
              <Input name="moveInDate" type="date" />
            </div>
            <div>
              <label className={labelCls}>Следующая индексация</label>
              <Input name="nextIndexationAt" type="date" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" name="needsCleaning" /> Уборка помещения
            </label>
            <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <Input name="cleaningFee" type="number" min={0} step="0.01" placeholder="₸/мес" className="w-28" />
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
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || pending}
            >
              <ChevronLeft className="h-4 w-4" /> Назад
            </Button>
            {onClose && (
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                Закрыть
              </Button>
            )}
          </div>
          {step < 2 ? (
            <Button type="button" onClick={next}>
              Далее <ChevronRight className="h-4 w-4" />
            </Button>
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
      </Card>

      {/* Справа — подсказка к текущему шагу и что будет дальше */}
      <aside className="space-y-4 lg:sticky lg:top-20">
        <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-500/30 dark:bg-blue-500/5">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Шаг {step + 1} из 3</p>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{STEPS[step]}</p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
            {STEP_HINTS[step].map((h) => (
              <li key={h} className="flex gap-2"><span className="text-blue-500">•</span><span>{h}</span></li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Что получится</p>
          <ol className="mt-3 space-y-3">
            {OUTCOME.map(([title, sub], i) => (
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

