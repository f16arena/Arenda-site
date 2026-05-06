"use client"

import { useMemo, useState, useTransition } from "react"
import type { ReactNode } from "react"
import {
  Check,
  Copy,
  Edit2,
  Gauge,
  Info,
  Layers3,
  Lock,
  Plus,
  Power,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { createPlan, deletePlan, duplicatePlan, updatePlan } from "@/app/actions/plans"
import {
  annualDiscountPercent,
  parsePlanFeatures,
  PLAN_CAPABILITY_GROUPS,
  PLAN_CAPABILITY_KEYS,
  PLAN_USAGE_LIMITS,
} from "@/lib/plan-capabilities"
import { cn } from "@/lib/utils"

type Plan = {
  id: string
  code: string
  name: string
  description: string | null
  priceMonthly: number
  priceYearly: number
  maxBuildings: number | null
  maxTenants: number | null
  maxUsers: number | null
  maxLeads: number | null
  features: string
  isActive: boolean
  sortOrder: number
  _count: { organizations: number; subscriptions: number }
}

export function PlansClient({ plans }: { plans: Plan[] }) {
  const [editing, setEditing] = useState<Plan | null>(null)
  const [creating, setCreating] = useState(false)

  return (
    <>
      <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Коммерческие пакеты
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Каждый тариф состоит из цены, лимитов и набора включенных функций. Неактивный тариф не должен выдаваться новым клиентам.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700"
          >
            <Plus className="h-4 w-4" />
            Создать тариф
          </button>
        </div>

        {plans.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Layers3 className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
              Тарифы еще не созданы
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Создайте первый тариф, чтобы назначать его организациям.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 p-4 xl:grid-cols-2">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onEdit={() => setEditing(plan)}
              />
            ))}
          </div>
        )}
      </div>

      {(editing || creating) && (
        <PlanForm
          plan={editing}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
        />
      )}
    </>
  )
}

function PlanCard({ plan, onEdit }: { plan: Plan; onEdit: () => void }) {
  const parsed = useMemo(() => parsePlanFeatures(plan.features), [plan.features])
  const enabledCount = PLAN_CAPABILITY_KEYS.filter((key) => parsed.flags[key]).length
  const discount = annualDiscountPercent(plan.priceMonthly, plan.priceYearly)
  const estimatedMrr = plan.priceMonthly * plan._count.organizations

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="border-b border-slate-100 p-4 dark:border-slate-800">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">{plan.name}</h3>
              <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {plan.code}
              </span>
              <span
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] font-medium",
                  plan.isActive
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                )}
              >
                {plan.isActive ? "Активен" : "Отключен"}
              </span>
            </div>
            {plan.description && (
              <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{plan.description}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <DuplicateButton planId={plan.id} />
            <IconButton label="Редактировать" onClick={onEdit}>
              <Edit2 className="h-4 w-4" />
            </IconButton>
            <DeleteButton planId={plan.id} orgCount={plan._count.organizations} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric label="Цена в месяц" value={`${formatMoney(plan.priceMonthly)} ₸`} />
          <Metric
            label="Цена в год"
            value={plan.priceYearly > 0 ? `${formatMoney(plan.priceYearly)} ₸` : "не задана"}
            note={discount > 0 ? `скидка ${discount}%` : undefined}
          />
          <Metric label="Оценочный MRR" value={`${formatMoney(estimatedMrr)} ₸`} />
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3">
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Лимиты</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Limit label="Здания" value={plan.maxBuildings} />
              <Limit label="Арендаторы" value={plan.maxTenants} />
              <Limit label="Пользователи" value={plan.maxUsers} />
              <Limit label="Лиды" value={plan.maxLeads} />
              {PLAN_USAGE_LIMITS.map((limit) => (
                <Limit key={limit.key} label={limit.label} value={parsed.limits[limit.key]} suffix={limit.unit} />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">Функции тарифа</span>
              <span className="text-slate-500 dark:text-slate-400">
                {enabledCount} / {PLAN_CAPABILITY_KEYS.length}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-purple-600"
                style={{ width: `${Math.round((enabledCount / PLAN_CAPABILITY_KEYS.length) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Покрытие по группам</p>
            <div className="space-y-2">
              {PLAN_CAPABILITY_GROUPS.map((group) => {
                const enabled = group.capabilities.filter((capability) => parsed.flags[capability.key]).length
                return (
                  <div key={group.key} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{group.label}</span>
                      <span className="text-slate-500 dark:text-slate-400">
                        {enabled}/{group.capabilities.length}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.round((enabled / group.capabilities.length) * 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {parsed.highlights.length > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <p className="mb-1 text-xs font-semibold text-emerald-800 dark:text-emerald-200">Ключевые обещания тарифа</p>
              <ul className="space-y-1 text-xs text-emerald-700 dark:text-emerald-300">
                {parsed.highlights.map((highlight) => (
                  <li key={highlight} className="flex gap-1.5">
                    <Check className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{highlight}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span>Используют: {plan._count.organizations} организаций</span>
        <span>Подписок в истории: {plan._count.subscriptions}</span>
      </div>
    </div>
  )
}

function PlanForm({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const [pending, startTransition] = useTransition()
  const isEdit = !!plan
  const parsed = useMemo(() => parsePlanFeatures(plan?.features), [plan?.features])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="my-4 w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-950">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">
              {isEdit ? "Редактирование тарифа" : "Новый тариф"}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {isEdit ? plan.name : "Создать коммерческий пакет"}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Отметьте функции, которые входят в тариф. Эти функции станут верхним пределом для будущих прав владельца и его команды.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-200"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          action={(formData) => {
            startTransition(async () => {
              try {
                if (isEdit && plan) {
                  await updatePlan(plan.id, formData)
                  toast.success("Тариф сохранен")
                } else {
                  await createPlan(formData)
                  toast.success("Тариф создан")
                }
                onClose()
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Не удалось сохранить тариф")
              }
            })
          }}
          className="grid gap-0 lg:grid-cols-[1fr_360px]"
        >
          <div className="space-y-5 p-6">
            <FormSection
              icon={<Layers3 className="h-4 w-4" />}
              title="Основное"
              description="Название, код, порядок показа и публичное описание тарифа."
            >
              <div className="grid gap-3 md:grid-cols-2">
                <Field
                  label="Код тарифа"
                  name="code"
                  defaultValue={plan?.code}
                  required={!isEdit}
                  disabled={isEdit}
                  placeholder="BUSINESS"
                  hint={isEdit ? "Код не меняется, чтобы не ломать существующие подписки." : "Латиница, цифры, _ или -. Например BUSINESS."}
                />
                <Field label="Название" name="name" defaultValue={plan?.name} required placeholder="Business" />
              </div>
              <Field
                label="Описание"
                name="description"
                defaultValue={plan?.description ?? ""}
                placeholder="Для БЦ, ТРЦ и управляющих компаний с несколькими объектами."
              />
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Цена в месяц, ₸" name="priceMonthly" type="number" defaultValue={plan?.priceMonthly ?? 0} min={0} />
                <Field label="Цена в год, ₸" name="priceYearly" type="number" defaultValue={plan?.priceYearly ?? 0} min={0} />
                <Field label="Порядок показа" name="sortOrder" type="number" defaultValue={plan?.sortOrder ?? 0} />
              </div>
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
                <input type="checkbox" name="isActive" defaultChecked={plan?.isActive ?? true} className="rounded" />
                Тариф активен и может назначаться клиентам
              </label>
            </FormSection>

            <FormSection
              icon={<Gauge className="h-4 w-4" />}
              title="Лимиты тарифа"
              description="Пустое поле означает безлимит. Эти ограничения проверяются перед созданием новых сущностей."
            >
              <div className="grid gap-3 md:grid-cols-4">
                <Field label="Макс. зданий" name="maxBuildings" type="number" defaultValue={plan?.maxBuildings ?? ""} min={0} />
                <Field label="Макс. арендаторов" name="maxTenants" type="number" defaultValue={plan?.maxTenants ?? ""} min={0} />
                <Field label="Макс. пользователей" name="maxUsers" type="number" defaultValue={plan?.maxUsers ?? ""} min={0} />
                <Field label="Макс. лидов" name="maxLeads" type="number" defaultValue={plan?.maxLeads ?? ""} min={0} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {PLAN_USAGE_LIMITS.map((limit) => (
                  <Field
                    key={limit.key}
                    label={`${limit.label}, ${limit.unit}`}
                    name={`limit_${limit.key}`}
                    type="number"
                    defaultValue={parsed.limits[limit.key] ?? ""}
                    min={0}
                    hint={limit.description}
                  />
                ))}
              </div>
            </FormSection>

            <FormSection
              icon={<Power className="h-4 w-4" />}
              title="Что входит в тариф"
              description="Это набор функций подписки. Позже владелец сможет раздавать права сотрудникам только внутри этих включенных функций."
            >
              <div className="space-y-4">
                {PLAN_CAPABILITY_GROUPS.map((group) => (
                  <details key={group.key} open className="rounded-xl border border-slate-200 dark:border-slate-800">
                    <summary className="cursor-pointer list-none px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{group.label}</p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{group.description}</p>
                        </div>
                        <span className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {group.capabilities.length} функций
                        </span>
                      </div>
                    </summary>
                    <div className="grid gap-2 border-t border-slate-100 p-3 dark:border-slate-800 md:grid-cols-2">
                      {group.capabilities.map((capability) => (
                        <label
                          key={capability.key}
                          className="flex cursor-pointer gap-3 rounded-lg border border-slate-200 p-3 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                        >
                          <input
                            type="checkbox"
                            name={`feature_${capability.key}`}
                            defaultChecked={parsed.flags[capability.key]}
                            className="mt-1 rounded"
                          />
                          <span>
                            <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                              {capability.label}
                              {capability.recommended && (
                                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                                  рекомендуется
                                </span>
                              )}
                              {capability.risk === "sensitive" && (
                                <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700 dark:bg-red-500/10 dark:text-red-300">
                                  <ShieldAlert className="h-3 w-3" />
                                  чувствительно
                                </span>
                              )}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
                              {capability.description}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </FormSection>

            <FormSection
              icon={<Info className="h-4 w-4" />}
              title="Ключевые обещания тарифа"
              description="Короткие пункты, которые помогут продавать тариф и объяснять, зачем он нужен."
            >
              <textarea
                name="highlights"
                defaultValue={parsed.highlights.join("\n")}
                rows={5}
                placeholder={"Например:\nПодходит для одного бизнес-центра\nДокументы и кабинет арендатора включены\nПоддержка отвечает в течение рабочего дня"}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-500 dark:border-slate-800 dark:bg-slate-950"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Один пункт на строку, максимум 8 пунктов.
              </p>
            </FormSection>
          </div>

          <aside className="border-t border-slate-100 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900/70 lg:border-l lg:border-t-0">
            <div className="sticky top-24 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Как это работает</p>
                <div className="mt-3 space-y-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  <p>
                    Superadmin включает функции в тарифе. Это верхний коммерческий предел для клиента.
                  </p>
                  <p>
                    Владелец внутри своей организации сможет создать должности и выдать сотрудникам только то, что включено здесь.
                  </p>
                  <p>
                    Если функция выключена в тарифе, кнопки и серверные действия должны быть недоступны независимо от роли.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <div className="mb-2 flex items-center gap-2 font-semibold">
                  <Lock className="h-4 w-4" />
                  Безопасное правило
                </div>
                Не включайте чувствительные функции вроде Support Mode, API или подписи в дешевые тарифы без бизнес-причины.
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex-1 rounded-lg bg-purple-600 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 disabled:opacity-60"
                >
                  {pending ? "Сохраняю..." : isEdit ? "Сохранить" : "Создать"}
                </button>
              </div>
            </div>
          </aside>
        </form>
      </div>
    </div>
  )
}

function DuplicateButton({ planId }: { planId: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <IconButton
      label="Дублировать"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          try {
            await duplicatePlan(planId)
            toast.success("Копия тарифа создана")
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Не удалось создать копию")
          }
        })
      }}
    >
      <Copy className="h-4 w-4" />
    </IconButton>
  )
}

function DeleteButton({ planId, orgCount }: { planId: string; orgCount: number }) {
  const [pending, startTransition] = useTransition()
  const disabled = pending || orgCount > 0

  return (
    <IconButton
      label={orgCount > 0 ? `Нельзя удалить: используют ${orgCount} организаций` : "Удалить"}
      disabled={disabled}
      danger
      onClick={() => {
        const confirmation = window.prompt('Это удалит тариф, если он не используется. Для подтверждения напишите "удалить".')
        if (confirmation?.trim().toLowerCase() !== "удалить") return
        startTransition(async () => {
          try {
            await deletePlan(planId)
            toast.success("Тариф удален")
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Не удалось удалить тариф")
          }
        })
      }}
    >
      <Trash2 className="h-4 w-4" />
    </IconButton>
  )
}

function IconButton({
  label,
  children,
  onClick,
  disabled,
  danger,
}: {
  label: string
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-40",
        danger
          ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
          : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100",
      )}
    >
      {children}
    </button>
  )
}

function FormSection({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <span className="text-slate-400 dark:text-slate-500">{icon}</span>
          {title}
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  )
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  placeholder,
  hint,
  disabled,
  min,
}: {
  label: string
  name: string
  type?: string
  defaultValue?: string | number | null
  required?: boolean
  placeholder?: string
  hint?: string
  disabled?: boolean
  min?: number
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      <input
        name={name}
        type={type}
        min={min}
        defaultValue={defaultValue ?? ""}
        required={required}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-500 disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:disabled:bg-slate-900"
      />
      {hint && <p className="mt-1 text-[11px] leading-4 text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      {note && <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-300">{note}</p>}
    </div>
  )
}

function Limit({ label, value, suffix }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-2 dark:border-slate-800">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-medium text-slate-900 dark:text-slate-100">
        {value === null ? "∞" : `${formatMoney(value)}${suffix ? ` ${suffix}` : ""}`}
      </span>
    </div>
  )
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value)
}
