export const dynamic = "force-dynamic"

import Link from "next/link"
import { RouteTabs } from "@/components/ui/route-tabs"
import { HEALTH_TABS } from "@/lib/hub-tabs"
import { redirect } from "next/navigation"
import {
  ArrowRight,
  Building2,
  Check,
  FileText,
  Landmark,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { db } from "@/lib/db"
import {
  getOnboardingState,
  type OnboardingStep,
  type OnboardingStepCategory,
} from "@/lib/onboarding"

const categoryMeta: Record<OnboardingStepCategory, {
  title: string
  subtitle: string
  icon: LucideIcon
  tone: string
}> = {
  foundation: {
    title: "Основа владельца",
    subtitle: "Реквизиты и первая точка учета",
    icon: Landmark,
    tone: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  },
  object: {
    title: "Объект",
    subtitle: "Здание, этажи, помещения и ставки",
    icon: Building2,
    tone: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  },
  people: {
    title: "Люди",
    subtitle: "Администратор, арендаторы и команда",
    icon: Users,
    tone: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  },
  legal: {
    title: "Документы",
    subtitle: "Нумерация, договоры и подписи",
    icon: FileText,
    tone: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  },
  finance: {
    title: "Финансы",
    subtitle: "Счета, начисления, тарифы и оплаты",
    icon: Wallet,
    tone: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  },
}

const categoryOrder: OnboardingStepCategory[] = ["foundation", "object", "people", "legal", "finance"]

export default async function OnboardingPage() {
  const session = await auth()
  if (!session) redirect("/login")
  const { orgId } = await requireOrgAccess()

  const [org, onboarding] = await Promise.all([
    db.organization.findUnique({
      where: { id: orgId },
      select: {
        name: true,
        planExpiresAt: true,
        plan: { select: { name: true, code: true } },
      },
    }),
    getOnboardingState(orgId),
  ])

  const isTrial = org?.plan?.code === "TRIAL"
  const now = new Date()
  const daysLeft = org?.planExpiresAt
    ? Math.max(0, Math.ceil((org.planExpiresAt.getTime() - now.getTime()) / 86_400_000))
    : null

  const grouped = categoryOrder.map((category) => ({
    category,
    steps: onboarding.steps.filter((step) => step.category === category),
  }))
  const recommendedOpen = onboarding.recommendedCount - onboarding.doneRecommendedCount
  const requiredOpen = onboarding.requiredCount - onboarding.doneRequiredCount

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <RouteTabs items={HEALTH_TABS} className="mb-2" />

      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Что осталось настроить</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {onboarding.allDone
            ? `${org?.name ?? "Организация"} готова к работе: обязательные шаги закрыты.`
            : `${org?.name ?? "Организация"} · осталось обязательных шагов: ${requiredOpen}`}
          {isTrial && daysLeft !== null && ` · пробный период: ${daysLeft} дн.`}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            Сделано {onboarding.doneRequiredCount} из {onboarding.requiredCount} обязательных
          </span>
          <span className="tabular-nums text-slate-500 dark:text-slate-400">{onboarding.percent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${onboarding.percent}%` }} />
        </div>

        {onboarding.nextRequiredStep ? (
          <div className="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800">
            <p className="text-xs uppercase tracking-wide text-slate-400">Следующий шаг</p>
            <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
              {onboarding.nextRequiredStep.title}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
              {onboarding.nextRequiredStep.outcome}
            </p>
            <Link
              href={onboarding.nextRequiredStep.href}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition active:scale-[0.97] hover:bg-blue-700"
            >
              {onboarding.nextRequiredStep.actionLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Обязательное закрыто — можно работать.
              {recommendedOpen > 0 && ` Необязательных пунктов осталось ${recommendedOpen}.`}
            </p>
            <Link
              href="/admin"
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition active:scale-[0.97] hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
            >
              На главную
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>

      {/* Шаги одной колонкой: раньше было две колонки разной высоты,
          три карточки с текстом «что владелец увидит» и три ссылки на
          разделы, которые и так открыты вкладками сверху. */}
      <div className="space-y-4">
        {grouped.map(({ category, steps }) => (
          <CategoryBlock key={category} category={category} steps={steps} />
        ))}
      </div>
    </div>
  )
}

function CategoryBlock({
  category,
  steps,
}: {
  category: OnboardingStepCategory
  steps: OnboardingStep[]
}) {
  const meta = categoryMeta[category]
  const Icon = meta.icon
  const doneRequired = steps.filter((step) => step.required && step.done).length
  const required = steps.filter((step) => step.required).length

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${meta.tone}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{meta.title}</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">{meta.subtitle}</p>
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          {doneRequired}/{required} обяз.
        </span>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {steps.map((step) => (
          <Link
            key={step.key}
            href={step.href}
            className="group flex items-start gap-3 px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
          >
            <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
              step.done
                ? "border-emerald-500 bg-emerald-500 text-white"
                : step.required
                  ? "border-amber-300 text-amber-500 dark:border-amber-500/60 dark:text-amber-300"
                  : "border-slate-200 text-slate-300 dark:border-slate-700 dark:text-slate-500"
            }`}>
              {step.done ? <Check className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{step.title}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  step.required
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}>
                  {step.required ? "обязательно" : "можно позже"}
                </span>
                {step.countLabel && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {step.countLabel}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{step.description}</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-400 dark:text-slate-500">{step.outcome}</p>
            </div>
            <div className="mt-1 flex shrink-0 items-center gap-1 text-xs font-medium text-blue-600 opacity-0 transition group-hover:opacity-100 dark:text-blue-300">
              {step.actionLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}


