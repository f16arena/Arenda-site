"use client"
import { askText } from "@/components/ui/dialog-host"

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
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { createPlan, deletePlan, duplicatePlan, updatePlan } from "@/app/actions/plans"
import {
  annualDiscountPercent,
  parsePlanFeatures,
  planFeatureDescription,
  planFeatureLabel,
  planGroupDescription,
  planGroupLabel,
  planLimitDescription,
  planLimitLabel,
  planLimitUnit,
  PLAN_CAPABILITY_GROUPS,
  PLAN_CAPABILITY_KEYS,
  PLAN_USAGE_LIMITS,
} from "@/lib/plan-capabilities"
import { cn } from "@/lib/utils"
import { useT } from "@/lib/i18n/client"
import { formatNumberL } from "@/lib/i18n/format"
import type { Locale } from "@/lib/i18n/config"

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
  const { t } = useT()
  const [editing, setEditing] = useState<Plan | null>(null)
  const [creating, setCreating] = useState(false)

  return (
    <>
      <Card className="block p-0">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t("superadmin.plans.packagesTitle")}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t("superadmin.plans.packagesHint")}
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700"
          >
            <Plus className="h-4 w-4" />
            {t("superadmin.plans.createPlan")}
          </button>
        </div>

        {plans.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Layers3 className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("superadmin.plans.emptyTitle")}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t("superadmin.plans.emptyHint")}
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
      </Card>

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
  const { t, tp, locale } = useT()
  const parsed = useMemo(() => parsePlanFeatures(plan.features), [plan.features])
  const enabledCount = PLAN_CAPABILITY_KEYS.filter((key) => parsed.flags[key]).length
  const discount = annualDiscountPercent(plan.priceMonthly, plan.priceYearly)
  const estimatedMrr = plan.priceMonthly * plan._count.organizations

  return (
    <Card className="block p-0">
      <div className="border-b border-slate-100 p-4 dark:border-slate-800">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">{plan.name}</h3>
              <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {plan.code}
              </span>
              <Badge
                variant="secondary"
                className={cn(
                  "text-[11px]",
                  plan.isActive
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                )}
              >
                {plan.isActive ? t("superadmin.plans.active") : t("superadmin.plans.disabled")}
              </Badge>
            </div>
            {plan.description && (
              <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{plan.description}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <DuplicateButton planId={plan.id} />
            <IconButton label={t("common.actions.edit")} onClick={onEdit}>
              <Edit2 className="h-4 w-4" />
            </IconButton>
            <DeleteButton planId={plan.id} orgCount={plan._count.organizations} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric label={t("superadmin.plans.priceMonthly")} value={`${formatMoney(locale, plan.priceMonthly)} ₸`} />
          <Metric
            label={t("superadmin.plans.priceYearly")}
            value={plan.priceYearly > 0 ? `${formatMoney(locale, plan.priceYearly)} ₸` : t("superadmin.plans.priceNotSet")}
            note={discount > 0 ? t("superadmin.plans.discount", { percent: discount }) : undefined}
          />
          <Metric label={t("superadmin.plans.estimatedMrr")} value={`${formatMoney(locale, estimatedMrr)} ₸`} />
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3">
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{t("superadmin.plans.limitsTitle")}</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Limit locale={locale} label={t("superadmin.plans.limitBuildings")} value={plan.maxBuildings} />
              <Limit locale={locale} label={t("superadmin.plans.limitTenants")} value={plan.maxTenants} />
              <Limit locale={locale} label={t("superadmin.plans.limitUsers")} value={plan.maxUsers} />
              <Limit locale={locale} label={t("superadmin.plans.limitLeads")} value={plan.maxLeads} />
              {PLAN_USAGE_LIMITS.map((limit) => (
                <Limit
                  key={limit.key}
                  locale={locale}
                  label={planLimitLabel(t, limit)}
                  value={parsed.limits[limit.key]}
                  suffix={planLimitUnit(t, limit)}
                />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">{t("superadmin.plans.featuresTitle")}</span>
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
            <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{t("superadmin.plans.groupsCoverage")}</p>
            <div className="space-y-2">
              {PLAN_CAPABILITY_GROUPS.map((group) => {
                const enabled = group.capabilities.filter((capability) => parsed.flags[capability.key]).length
                return (
                  <div key={group.key} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{planGroupLabel(t, group)}</span>
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
              <p className="mb-1 text-xs font-semibold text-emerald-800 dark:text-emerald-200">{t("superadmin.plans.highlightsTitle")}</p>
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
        <span>{tp("superadmin.plans.usedBy", plan._count.organizations)}</span>
        <span>{t("superadmin.plans.subscriptionsInHistory", { count: plan._count.subscriptions })}</span>
      </div>
    </Card>
  )
}

function PlanForm({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const { t } = useT()
  const [pending, startTransition] = useTransition()
  const isEdit = !!plan
  const parsed = useMemo(() => parsePlanFeatures(plan?.features), [plan?.features])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="my-4 w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-950">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">
              {isEdit ? t("superadmin.plans.formEditEyebrow") : t("superadmin.plans.formNewEyebrow")}
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {isEdit ? plan.name : t("superadmin.plans.formNewTitle")}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t("superadmin.plans.formHint")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-900 dark:hover:text-slate-200"
            aria-label={t("common.actions.close")}
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
                  toast.success(t("superadmin.plans.saved"))
                } else {
                  await createPlan(formData)
                  toast.success(t("superadmin.plans.created"))
                }
                onClose()
              } catch (error) {
                toast.error(error instanceof Error ? error.message : t("superadmin.plans.saveFailed"))
              }
            })
          }}
          className="grid gap-0 lg:grid-cols-[1fr_360px]"
        >
          <div className="space-y-5 p-6">
            <FormSection
              icon={<Layers3 className="h-4 w-4" />}
              title={t("superadmin.plans.sectionMain")}
              description={t("superadmin.plans.sectionMainHint")}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <Field
                  label={t("superadmin.plans.fieldCode")}
                  name="code"
                  defaultValue={plan?.code}
                  required={!isEdit}
                  disabled={isEdit}
                  placeholder="BUSINESS"
                  hint={isEdit ? t("superadmin.plans.codeHintEdit") : t("superadmin.plans.codeHintNew")}
                />
                <Field label={t("superadmin.plans.fieldName")} name="name" defaultValue={plan?.name} required placeholder="Business" />
              </div>
              <Field
                label={t("superadmin.plans.fieldDescription")}
                name="description"
                defaultValue={plan?.description ?? ""}
                placeholder={t("superadmin.plans.descriptionPlaceholder")}
              />
              <div className="grid gap-3 md:grid-cols-3">
                <Field label={t("superadmin.plans.fieldPriceMonthly")} name="priceMonthly" type="number" defaultValue={plan?.priceMonthly ?? 0} min={0} />
                <Field label={t("superadmin.plans.fieldPriceYearly")} name="priceYearly" type="number" defaultValue={plan?.priceYearly ?? 0} min={0} />
                <Field label={t("superadmin.plans.fieldSortOrder")} name="sortOrder" type="number" defaultValue={plan?.sortOrder ?? 0} />
              </div>
              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300">
                <input type="checkbox" name="isActive" defaultChecked={plan?.isActive ?? true} className="rounded" />
                {t("superadmin.plans.fieldIsActive")}
              </label>
            </FormSection>

            <FormSection
              icon={<Gauge className="h-4 w-4" />}
              title={t("superadmin.plans.sectionLimits")}
              description={t("superadmin.plans.sectionLimitsHint")}
            >
              <div className="grid gap-3 md:grid-cols-4">
                <Field label={t("superadmin.plans.fieldMaxBuildings")} name="maxBuildings" type="number" defaultValue={plan?.maxBuildings ?? ""} min={0} />
                <Field label={t("superadmin.plans.fieldMaxTenants")} name="maxTenants" type="number" defaultValue={plan?.maxTenants ?? ""} min={0} />
                <Field label={t("superadmin.plans.fieldMaxUsers")} name="maxUsers" type="number" defaultValue={plan?.maxUsers ?? ""} min={0} />
                <Field label={t("superadmin.plans.fieldMaxLeads")} name="maxLeads" type="number" defaultValue={plan?.maxLeads ?? ""} min={0} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {PLAN_USAGE_LIMITS.map((limit) => (
                  <Field
                    key={limit.key}
                    label={`${planLimitLabel(t, limit)}, ${planLimitUnit(t, limit)}`}
                    name={`limit_${limit.key}`}
                    type="number"
                    defaultValue={parsed.limits[limit.key] ?? ""}
                    min={0}
                    hint={planLimitDescription(t, limit)}
                  />
                ))}
              </div>
            </FormSection>

            <FormSection
              icon={<Power className="h-4 w-4" />}
              title={t("superadmin.plans.sectionFeatures")}
              description={t("superadmin.plans.sectionFeaturesHint")}
            >
              <div className="space-y-4">
                {PLAN_CAPABILITY_GROUPS.map((group) => (
                  <details key={group.key} open className="rounded-xl border border-slate-200 dark:border-slate-800">
                    <summary className="cursor-pointer list-none px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{planGroupLabel(t, group)}</p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{planGroupDescription(t, group)}</p>
                        </div>
                        <span className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {t("superadmin.plans.featuresCount", { count: group.capabilities.length })}
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
                              {planFeatureLabel(t, capability.key)}
                              {capability.recommended && (
                                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                                  {t("superadmin.plans.recommended")}
                                </span>
                              )}
                              {capability.risk === "sensitive" && (
                                <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] text-red-700 dark:bg-red-500/10 dark:text-red-300">
                                  <ShieldAlert className="h-3 w-3" />
                                  {t("superadmin.plans.sensitive")}
                                </span>
                              )}
                              {capability.plannedQuarter && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  🕐 {t("superadmin.plans.planned", { quarter: capability.plannedQuarter })}
                                </span>
                              )}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
                              {planFeatureDescription(t, capability)}
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
              title={t("superadmin.plans.sectionHighlights")}
              description={t("superadmin.plans.sectionHighlightsHint")}
            >
              <textarea
                name="highlights"
                defaultValue={parsed.highlights.join("\n")}
                rows={5}
                placeholder={t("superadmin.plans.highlightsPlaceholder")}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-500 dark:border-slate-800 dark:bg-slate-950"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {t("superadmin.plans.highlightsHint")}
              </p>
            </FormSection>
          </div>

          <aside className="border-t border-slate-100 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900/70 lg:border-l lg:border-t-0">
            <div className="sticky top-24 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("superadmin.plans.howItWorks")}</p>
                <div className="mt-3 space-y-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  <p>{t("superadmin.plans.howItWorks1")}</p>
                  <p>{t("superadmin.plans.howItWorks2")}</p>
                  <p>{t("superadmin.plans.howItWorks3")}</p>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                <div className="mb-2 flex items-center gap-2 font-semibold">
                  <Lock className="h-4 w-4" />
                  {t("superadmin.plans.safeRule")}
                </div>
                {t("superadmin.plans.safeRuleText")}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                >
                  {t("common.actions.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex-1 rounded-lg bg-purple-600 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 disabled:opacity-60"
                >
                  {pending ? t("superadmin.plans.saving") : isEdit ? t("common.actions.save") : t("common.actions.create")}
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
  const { t } = useT()
  const [pending, startTransition] = useTransition()

  return (
    <IconButton
      label={t("superadmin.plans.duplicate")}
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          try {
            await duplicatePlan(planId)
            toast.success(t("superadmin.plans.duplicated"))
          } catch (error) {
            toast.error(error instanceof Error ? error.message : t("superadmin.plans.duplicateFailed"))
          }
        })
      }}
    >
      <Copy className="h-4 w-4" />
    </IconButton>
  )
}

function DeleteButton({ planId, orgCount }: { planId: string; orgCount: number }) {
  const { t } = useT()
  const [pending, startTransition] = useTransition()
  const disabled = pending || orgCount > 0
  // Слово-подтверждение берём из словаря: пользователь вводит его на своём
  // языке, а сравнение идёт с той же строкой.
  const confirmWord = t("superadmin.plans.deleteConfirmWord")

  return (
    <IconButton
      label={orgCount > 0 ? t("superadmin.plans.deleteBlocked", { count: orgCount }) : t("common.actions.delete")}
      disabled={disabled}
      danger
      onClick={async () => {
        const confirmation = await askText({
          title: t("superadmin.plans.deleteTitle"),
          description: t("superadmin.plans.deleteDescription"),
          requireText: confirmWord,
          confirmLabel: t("common.actions.delete"),
        })
        if (confirmation?.trim().toLowerCase() !== confirmWord) return
        startTransition(async () => {
          try {
            await deletePlan(planId)
            toast.success(t("superadmin.plans.deleted"))
          } catch (error) {
            toast.error(error instanceof Error ? error.message : t("superadmin.plans.deleteFailed"))
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

function Limit({ locale, label, value, suffix }: { locale: Locale; label: string; value: number | null; suffix?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-2 dark:border-slate-800">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-medium text-slate-900 dark:text-slate-100">
        {value === null ? "∞" : `${formatMoney(locale, value)}${suffix ? ` ${suffix}` : ""}`}
      </span>
    </div>
  )
}

function formatMoney(locale: Locale, value: number) {
  return formatNumberL(locale, value)
}
