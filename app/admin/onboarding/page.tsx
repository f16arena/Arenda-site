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
  ListChecks,
  ShieldCheck,
  Sparkles,
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
    tone: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  },
  object: {
    title: "Объект",
    subtitle: "Здание, этажи, помещения и ставки",
    icon: Building2,
    tone: "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300",
  },
  people: {
    title: "Люди",
    subtitle: "Администратор, арендаторы и команда",
    icon: Users,
    tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  },
  legal: {
    title: "Документы",
    subtitle: "Номера, шаблоны, договоры и подписи",
    icon: FileText,
    tone: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
  },
  finance: {
    title: "Финансы",
    subtitle: "Счета, начисления, тарифы и оплаты",
    icon: Wallet,
    tone: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
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
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-5 lg:grid-cols-[1.4fr_0.8fr] lg:items-center">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Запуск владельца</h1>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {org?.name ?? "организация"}
                </span>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                Это короткая обучалка по реальным разделам системы. Она показывает, что уже готово,
                что мешает формировать документы и принимать оплаты, и куда нажать дальше.
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Тариф: {org?.plan?.name ?? "не назначен"}
                </span>
                {isTrial && daysLeft !== null && (
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                    Триал: {daysLeft} дн.
                  </span>
                )}
                {onboarding.allDone ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    Обязательная настройка завершена
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                    Осталось обязательных: {requiredOpen}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {onboarding.doneRequiredCount} из {onboarding.requiredCount} обязательных
              </span>
              <span className="font-mono text-slate-500 dark:text-slate-400">{onboarding.percent}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${onboarding.percent}%` }}
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
              Рекомендованные пункты: {onboarding.doneRecommendedCount} из {onboarding.recommendedCount}
              {recommendedOpen > 0 ? `, можно закрыть после запуска: ${recommendedOpen}` : "."}
            </p>
          </div>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <FocusCard
          title={onboarding.nextRequiredStep ? "Следующий обязательный шаг" : "База готова"}
          icon={ClipboardCheck}
          tone={onboarding.nextRequiredStep ? "blue" : "emerald"}
        >
          {onboarding.nextRequiredStep ? (
            <div>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{onboarding.nextRequiredStep.title}</p>
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{onboarding.nextRequiredStep.outcome}</p>
              <Link
                href={onboarding.nextRequiredStep.href}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
              >
                {onboarding.nextRequiredStep.actionLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">Можно работать в панели</p>
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                Основные данные есть: объект, арендаторы, документы и финансы готовы к ежедневной работе.
              </p>
              <Link
                href="/admin"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Открыть дашборд
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </FocusCard>

        <FocusCard title="Что владелец увидит" icon={ListChecks} tone="slate">
          <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <li>Доход, расход, прибыль и долг по всем зданиям.</li>
            <li>Какие договоры заканчиваются и кто просрочил оплату.</li>
            <li>Какие данные мешают документам и оплатам.</li>
          </ul>
        </FocusCard>

        <FocusCard title="Можно вернуться позже" icon={BadgeCheck} tone="slate">
          <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">
            Обучалка остается в меню “Запуск”. Если владелец не готов заполнить все сразу,
            он может выйти в дашборд и продолжить настройку позже.
          </p>
          <Link href="/admin" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-300">
            Пропустить сейчас
            <ArrowRight className="h-4 w-4" />
          </Link>
        </FocusCard>
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
          text="Найти арендаторов без контактов, помещения без привязки, договоры без подписи и счета без срока."
        />
        <QuickAction
          href="/admin/system-health"
          icon={BadgeCheck}
          title="Проверить систему"
          text="Убедиться, что база, cron, email, RLS, sitemap, storage и логи готовы к production."
        />
        <QuickAction
          href="/admin/settings"
          icon={Landmark}
          title="Открыть настройки"
          text="Реквизиты, НДС, банки, нумерация документов, тарифы коммунальных услуг и данные здания."
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

function FocusCard({
  title,
  icon: Icon,
  tone,
  children,
}: {
  title: string
  icon: LucideIcon
  tone: "blue" | "emerald" | "slate"
  children: React.ReactNode
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      </div>
      {children}
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
  icon: LucideIcon
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
