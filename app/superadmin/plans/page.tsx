export const dynamic = "force-dynamic"

import { Layers3, PackageCheck, Power, TrendingUp } from "lucide-react"
import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import { safeServerValue } from "@/lib/server-fallback"
import { enabledPlanCapabilityCount } from "@/lib/plan-capabilities"
import { PlansClient } from "./plans-client"

export default async function PlansPage() {
  const { userId } = await requirePlatformOwner()

  const plans = await safeServerValue(
    db.plan.findMany({
      orderBy: [{ sortOrder: "asc" }, { priceMonthly: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        priceMonthly: true,
        priceYearly: true,
        maxBuildings: true,
        maxTenants: true,
        maxUsers: true,
        maxLeads: true,
        features: true,
        isActive: true,
        sortOrder: true,
        _count: { select: { organizations: true, subscriptions: true } },
      },
    }),
    [],
    { source: "superadmin.plans.items", route: "/superadmin/plans", userId },
  )

  const activePlans = plans.filter((plan) => plan.isActive).length
  const assignedOrganizations = plans.reduce((sum, plan) => sum + plan._count.organizations, 0)
  const estimatedMrr = plans.reduce((sum, plan) => sum + plan.priceMonthly * plan._count.organizations, 0)
  const capabilitySlots = plans.reduce((sum, plan) => sum + enabledPlanCapabilityCount(plan.features), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">
            Конструктор подписок
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Тарифы платформы
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Здесь superadmin определяет, что клиент покупает: цену, лимиты, модули и возможности тарифа.
            Владелец внутри своей организации потом раздаст доступ сотрудникам только в пределах этих функций.
          </p>
        </div>
        <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-xs text-purple-900 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-200">
          Тариф = коммерческий пакет. Должности владельца будут следующим слоем доступа.
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Всего тарифов"
          value={plans.length}
          detail={`${activePlans} активных`}
          icon={Layers3}
          tone="slate"
        />
        <SummaryCard
          label="Организаций на тарифах"
          value={assignedOrganizations}
          detail="клиенты с назначенным планом"
          icon={PackageCheck}
          tone="emerald"
        />
        <SummaryCard
          label="Оценочный MRR"
          value={`${estimatedMrr.toLocaleString("ru-RU")} ₸`}
          detail="по текущим организациям"
          icon={TrendingUp}
          tone="blue"
        />
        <SummaryCard
          label="Включенных функций"
          value={capabilitySlots}
          detail="суммарно по всем тарифам"
          icon={Power}
          tone="amber"
        />
      </div>

      <PlansClient plans={plans} />
    </div>
  )
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string
  value: string | number
  detail: string
  icon: typeof Layers3
  tone: "slate" | "emerald" | "blue" | "amber"
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</div>
      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">{detail}</div>
    </div>
  )
}
