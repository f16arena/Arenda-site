export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { tenantScope } from "@/lib/tenant-scope"
import { cn } from "@/lib/utils"
import {
  PLAN_CAPABILITY_GROUPS,
  PLAN_USAGE_LIMITS,
  parsePlanFeatures,
} from "@/lib/plan-capabilities"
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle,
  FileText,
  Lock,
  MessageCircle,
  Package,
  Star,
  Users,
} from "lucide-react"

export default async function SubscriptionPage() {
  const { orgId } = await requireOrgAccess()

  const org = await db.organization.findUnique({
    where: { id: orgId },
    include: {
      plan: true,
      subscriptions: { orderBy: { startedAt: "desc" }, take: 5, include: { plan: { select: { name: true } } } },
    },
  })
  if (!org) return null

  const planFeatures = parsePlanFeatures(org.plan?.features)
  const buildings = await db.building.findMany({
    where: { organizationId: orgId },
    select: { id: true },
  })
  const buildingIds = buildings.map((building) => building.id)
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)

  const [tenantsCount, usersCount, leadsCount, storageAggregate, generatedDocumentsCount] = await Promise.all([
    db.tenant.count({ where: tenantScope(orgId) }),
    db.user.count({ where: { organizationId: orgId } }),
    buildingIds.length
      ? db.lead.count({ where: { buildingId: { in: buildingIds } } }).catch(() => 0)
      : Promise.resolve(0),
    db.storedFile.aggregate({
      where: { organizationId: orgId, deletedAt: null },
      _sum: { compressedSize: true },
    }).catch(() => ({ _sum: { compressedSize: 0 } })),
    db.generatedDocument.count({
      where: { organizationId: orgId, generatedAt: { gte: monthStart } },
    }).catch(() => 0),
  ])

  const storageGb = ((storageAggregate._sum.compressedSize ?? 0) / 1024 / 1024 / 1024)
  const now = new Date()
  const expired = !!(org.planExpiresAt && org.planExpiresAt < now)
  const daysLeft = org.planExpiresAt
    ? Math.max(0, Math.ceil((org.planExpiresAt.getTime() - now.getTime()) / 86_400_000))
    : null

  const usage = [
    { key: "buildings", label: "Здания", current: buildings.length, max: org.plan?.maxBuildings ?? null, icon: Building2, unit: "шт." },
    { key: "tenants", label: "Арендаторы", current: tenantsCount, max: org.plan?.maxTenants ?? null, icon: Users, unit: "шт." },
    { key: "users", label: "Пользователи", current: usersCount, max: org.plan?.maxUsers ?? null, icon: Users, unit: "шт." },
    { key: "leads", label: "Лиды", current: leadsCount, max: org.plan?.maxLeads ?? null, icon: MessageCircle, unit: "шт." },
    { key: "storageGb", label: "Хранилище", current: storageGb, max: planFeatures.limits.storageGb, icon: Package, unit: "ГБ", precision: 2 },
    { key: "documentsPerMonth", label: "Документы за месяц", current: generatedDocumentsCount, max: planFeatures.limits.documentsPerMonth, icon: FileText, unit: "шт." },
  ]

  const enabledCount = Object.values(planFeatures.flags).filter(Boolean).length
  const totalFeatureCount = PLAN_CAPABILITY_GROUPS.reduce((sum, group) => sum + group.capabilities.length, 0)

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10">
            <Package className="h-5 w-5 text-purple-300" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">Подписка и возможности</h1>
            <p className="mt-0.5 text-sm text-slate-400">{org.name}</p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Включено функций</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">{enabledCount} / {totalFeatureCount}</p>
        </div>
      </div>

      <div className={cn(
        "rounded-2xl border p-6",
        expired
          ? "border-red-500/30 bg-red-500/10"
          : daysLeft !== null && daysLeft <= 7
            ? "border-amber-500/30 bg-amber-500/10"
            : "border-purple-500/30 bg-purple-500/10",
      )}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Текущий тариф</p>
            <h2 className="mt-1 text-3xl font-bold text-slate-100">{org.plan?.name ?? "Не выбран"}</h2>
            {org.plan && (
              <p className="mt-1 text-lg text-slate-300">
                {org.plan.priceMonthly.toLocaleString("ru-RU")} ₸/мес · {org.plan.priceYearly.toLocaleString("ru-RU")} ₸/год
              </p>
            )}
            {planFeatures.highlights.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {planFeatures.highlights.map((item) => (
                  <span key={item} className="inline-flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-xs text-purple-200">
                    <Star className="h-3.5 w-3.5" />
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="text-left lg:text-right">
            {expired ? (
              <p className="font-semibold text-red-300"><AlertTriangle className="mr-1 inline h-5 w-5" /> Подписка истекла</p>
            ) : daysLeft !== null ? (
              <>
                <p className="text-3xl font-bold text-slate-100">{daysLeft}</p>
                <p className="text-xs text-slate-400">дней осталось</p>
              </>
            ) : (
              <p className="text-sm text-slate-400">Дата окончания не задана</p>
            )}
            {org.planExpiresAt && (
              <p className="mt-2 text-xs text-slate-500">до {org.planExpiresAt.toLocaleDateString("ru-RU")}</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {usage.map(({ key, ...item }) => (
          <UsageCard key={key} {...item} />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {PLAN_CAPABILITY_GROUPS.map((group) => {
          const groupEnabled = group.capabilities.filter((capability) => planFeatures.flags[capability.key]).length
          return (
            <div key={group.key} className="rounded-xl border border-slate-800 bg-slate-900">
              <div className="border-b border-slate-800 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100">{group.label}</h2>
                    <p className="mt-1 text-xs text-slate-500">{group.description}</p>
                  </div>
                  <span className="rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-400">
                    {groupEnabled}/{group.capabilities.length}
                  </span>
                </div>
              </div>
              <div className="space-y-2 p-4">
                {group.capabilities.map((capability) => {
                  const enabled = planFeatures.flags[capability.key] === true
                  return (
                    <div
                      key={capability.key}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3",
                        enabled
                          ? "border-emerald-500/30 bg-emerald-500/10"
                          : "border-slate-800 bg-slate-950/40",
                      )}
                    >
                      {enabled ? (
                        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                      ) : (
                        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
                      )}
                      <div>
                        <p className={cn("text-sm font-medium", enabled ? "text-emerald-100" : "text-slate-400")}>
                          {capability.label}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">{capability.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Calendar className="h-4 w-4 text-slate-500" />
            История подписок
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-800/50">
              <th className="px-5 py-2 text-left text-xs font-medium text-slate-500">Тариф</th>
              <th className="px-5 py-2 text-left text-xs font-medium text-slate-500">Период</th>
              <th className="px-5 py-2 text-right text-xs font-medium text-slate-500">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {org.subscriptions.length === 0 ? (
              <tr><td colSpan={3} className="px-5 py-6 text-center text-sm text-slate-500">Нет записей</td></tr>
            ) : org.subscriptions.map((subscription) => (
              <tr key={subscription.id} className="border-b border-slate-800/70">
                <td className="px-5 py-2.5 text-slate-300">{subscription.plan.name}</td>
                <td className="px-5 py-2.5 text-xs text-slate-500">
                  {new Date(subscription.startedAt).toLocaleDateString("ru-RU")} → {new Date(subscription.expiresAt).toLocaleDateString("ru-RU")}
                </td>
                <td className="px-5 py-2.5 text-right font-medium text-emerald-400">
                  {subscription.paidAmount.toLocaleString("ru-RU")} ₸
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-sm font-semibold text-slate-100">Дополнительные лимиты тарифа</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {PLAN_USAGE_LIMITS.map((limit) => (
            <div key={limit.key} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
              <p className="text-sm text-slate-200">{limit.label}</p>
              <p className="mt-0.5 text-xs text-slate-500">{limit.description}</p>
              <p className="mt-2 text-xs font-medium text-slate-400">
                Лимит: {planFeatures.limits[limit.key] === null ? "без ограничения" : `${planFeatures.limits[limit.key]} ${limit.unit}`}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function UsageCard({
  label,
  current,
  max,
  icon: Icon,
  unit,
  precision = 0,
}: {
  label: string
  current: number
  max: number | null
  icon: React.ElementType
  unit: string
  precision?: number
}) {
  const percent = max === null || max === 0 ? 0 : Math.min(100, Math.round((current / max) * 100))
  const isFull = max !== null && max > 0 && current >= max
  const isWarning = max !== null && max > 0 && percent >= 80
  const currentLabel = precision > 0 ? current.toFixed(precision) : Math.round(current).toLocaleString("ru-RU")
  const maxLabel = max === null ? "∞" : precision > 0 ? max.toFixed(precision) : Math.round(max).toLocaleString("ru-RU")

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Icon className="h-4 w-4 text-slate-500" />
          {label}
        </div>
        <span className={cn(
          "rounded-full px-2 py-1 text-xs font-medium",
          isFull ? "bg-red-500/10 text-red-300" : isWarning ? "bg-amber-500/10 text-amber-300" : "bg-emerald-500/10 text-emerald-300",
        )}>
          {max === null ? "без лимита" : `${percent}%`}
        </span>
      </div>
      <p className="text-2xl font-bold text-slate-100">
        {currentLabel}
        <span className="ml-1 text-sm font-normal text-slate-500">/ {maxLabel} {unit}</span>
      </p>
      {max !== null && max > 0 && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
          <div
            className={cn("h-full", isFull ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-emerald-500")}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  )
}
