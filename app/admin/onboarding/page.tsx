export const dynamic = "force-dynamic"

import Link from "next/link"
import { redirect } from "next/navigation"
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  ClipboardCheck,
  FileText,
  Landmark,
  ShieldCheck,
  Users,
  Wallet,
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
  icon: typeof Building2
  tone: string
}> = {
  setup: {
    title: "Объект",
    icon: Building2,
    tone: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  },
  people: {
    title: "Люди",
    icon: Users,
    tone: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300",
  },
  legal: {
    title: "Документы",
    icon: FileText,
    tone: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
  },
  finance: {
    title: "Финансы",
    icon: Wallet,
    tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
}

const categoryOrder: OnboardingStepCategory[] = ["setup", "people", "legal", "finance"]

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

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Запуск платформы</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Чеклист базовой настройки для {org?.name ?? "организации"}.
          </p>
        </div>
        <Link
          href={onboarding.nextStep?.href ?? "/admin"}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
        >
          {onboarding.nextStep ? "Продолжить настройку" : "Перейти в панель"}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-5 lg:grid-cols-[1.4fr_0.8fr] lg:items-center">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
              <ClipboardCheck className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {onboarding.allDone ? "Базовая настройка завершена" : "Что нужно сделать, чтобы система работала без объяснений"}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {onboarding.allDone
                  ? "Можно переходить к регулярной работе: финансы, документы, заявки и качество данных."
                  : onboarding.nextStep
                    ? `Следующий шаг: ${onboarding.nextStep.title.toLowerCase()}.`
                    : "Проверяем ключевые настройки объекта, людей, документов и финансов."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Тариф: {org?.plan?.name ?? "не назначен"}
                </span>
                {isTrial && daysLeft !== null && (
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                    Триал: {daysLeft} дн.
                  </span>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">{onboarding.doneCount} из {onboarding.totalCount}</span>
              <span className="font-mono text-slate-500 dark:text-slate-400">{onboarding.percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${onboarding.percent}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {grouped.map(({ category, steps }) => (
          <CategoryBlock key={category} category={category} steps={steps} />
        ))}
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <QuickAction
          href="/admin/data-quality"
          icon={ShieldCheck}
          title="Проверить качество данных"
          text="Найти арендаторов без контактов, договоры без дат, счета без срока оплаты."
        />
        <QuickAction
          href="/admin/system-health"
          icon={BadgeCheck}
          title="Проверить систему"
          text="Убедиться, что база, cron, email, RLS, sitemap и логи готовы к production."
        />
        <QuickAction
          href="/admin/finances/balance"
          icon={Landmark}
          title="Настроить деньги"
          text="Добавить счет, кассу или карту, чтобы платежи и сверка были понятными."
        />
      </section>
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
  const done = steps.filter((step) => step.done).length

  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${meta.tone}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{meta.title}</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500">{done} из {steps.length} готово</p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {steps.map((step) => (
          <Link
            key={step.key}
            href={step.href}
            className="flex items-start gap-3 px-5 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
          >
            <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
              step.done
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-slate-200 text-slate-300 dark:border-slate-700 dark:text-slate-500"
            }`}>
              {step.done ? <Check className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{step.title}</p>
                {step.countLabel && (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {step.countLabel}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{step.description}</p>
            </div>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
          </Link>
        ))}
      </div>
    </section>
  )
}

function QuickAction({
  href,
  icon: Icon,
  title,
  text,
}: {
  href: string
  icon: typeof Building2
  title: string
  text: string
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-blue-200 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-500/40"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{text}</p>
        </div>
      </div>
    </Link>
  )
}
