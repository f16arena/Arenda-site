export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { Package, Calendar, AlertTriangle, CheckCircle, Building2, Users, MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"

type FeatureFlags = {
  emailNotifications?: boolean
  telegramBot?: boolean
  floorEditor?: boolean
  contractTemplates?: boolean
  bankImport?: boolean
  excelExport?: boolean
  export1c?: boolean
  cmdkSearch?: boolean
  customDomain?: boolean
  api?: boolean
  whiteLabel?: boolean
  aiAssistant?: boolean
  prioritySupport?: boolean
}

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

  // Текущая статистика использования
  const floorIds = (await db.floor.findMany({
    where: { building: { organizationId: orgId } },
    select: { id: true },
  })).map((f) => f.id)

  const [buildingsCount, tenantsCount, usersCount, leadsCount] = await Promise.all([
    db.building.count({ where: { organizationId: orgId } }),
    db.tenant.count({
      where: floorIds.length > 0
        ? { OR: [{ space: { floorId: { in: floorIds } } }, { spaceId: null }] }
        : undefined,
    }).catch(() => 0),
    db.user.count({ where: { organizationId: orgId } }),
    (async () => {
      const buildings = await db.building.findMany({ where: { organizationId: orgId }, select: { id: true } })
      const ids = buildings.map((b) => b.id)
      if (ids.length === 0) return 0
      return db.lead.count({ where: { buildingId: { in: ids } } }).catch(() => 0)
    })(),
  ])

  const features: FeatureFlags = org.plan?.features
    ? (() => { try { return JSON.parse(org.plan.features) } catch { return {} } })()
    : {}

  const now = new Date()
  const expired = org.planExpiresAt && org.planExpiresAt < now
  const daysLeft = org.planExpiresAt
    ? Math.max(0, Math.ceil((org.planExpiresAt.getTime() - now.getTime()) / 86_400_000))
    : null

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-500/10">
          <Package className="h-5 w-5 text-purple-600 dark:text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Моя подписка</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">{org.name}</p>
        </div>
      </div>

      {/* Текущий план */}
      <div className={cn(
        "rounded-xl border-2 p-6",
        expired ? "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30" :
        daysLeft !== null && daysLeft <= 7 ? "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30" :
        "bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/30"
      )}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-500 uppercase mb-1">Текущий тариф</p>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{org.plan?.name ?? "Не выбран"}</h2>
            {org.plan && (
              <p className="text-lg text-slate-600 dark:text-slate-400 dark:text-slate-500 mt-1">
                {org.plan.priceMonthly.toLocaleString("ru-RU")} ₸/мес
              </p>
            )}
          </div>
          <div className="text-right">
            {expired ? (
              <div className="text-red-700 dark:text-red-300">
                <AlertTriangle className="h-5 w-5 inline mr-1" />
                <span className="font-semibold">Подписка истекла</span>
              </div>
            ) : daysLeft !== null ? (
              <div>
                <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{daysLeft}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 dark:text-slate-500">дней осталось</p>
              </div>
            ) : null}
            {org.planExpiresAt && (
              <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-2">
                до {org.planExpiresAt.toLocaleDateString("ru-RU")}
              </p>
            )}
          </div>
        </div>
        {(expired || (daysLeft !== null && daysLeft <= 7)) && (
          <div className="mt-4 pt-4 border-t border-current/20">
            <p className="text-sm font-medium">
              💬 Свяжитесь с администрацией для продления подписки
            </p>
          </div>
        )}
      </div>

      {/* Лимиты */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Использование лимитов</h2>
        </div>
        <div className="p-5 space-y-4">
          <Usage label="Зданий" current={buildingsCount} max={org.plan?.maxBuildings ?? null} icon={Building2} />
          <Usage label="Арендаторов" current={tenantsCount} max={org.plan?.maxTenants ?? null} icon={Users} />
          <Usage label="Сотрудников" current={usersCount} max={org.plan?.maxUsers ?? null} icon={Users} />
          <Usage label="Лидов" current={leadsCount} max={org.plan?.maxLeads ?? null} icon={MessageCircle} />
        </div>
      </div>

      {/* Фичи */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Доступные функции</h2>
        </div>
        <div className="grid grid-cols-2 gap-2 p-5">
          {[
            ["emailNotifications", "Email уведомления"],
            ["telegramBot", "Telegram бот"],
            ["floorEditor", "Графический редактор плана"],
            ["contractTemplates", "Шаблоны документов"],
            ["bankImport", "Импорт банковской выписки"],
            ["excelExport", "Excel экспорт"],
            ["export1c", "1С экспорт"],
            ["cmdkSearch", "Глобальный поиск Ctrl+K"],
            ["aiAssistant", "ИИ-ассистент"],
            ["customDomain", "Кастомный домен"],
            ["whiteLabel", "White label"],
            ["api", "Public API"],
          ].map(([key, label]) => {
            const enabled = features[key as keyof FeatureFlags]
            return (
              <div key={key} className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm",
                enabled ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 line-through"
              )}>
                {enabled ? <CheckCircle className="h-3.5 w-3.5" /> : <span className="w-3.5" />}
                {label}
              </div>
            )
          })}
        </div>
      </div>

      {/* История подписок */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            История подписок
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Тариф</th>
              <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Период</th>
              <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {org.subscriptions.length === 0 ? (
              <tr><td colSpan={3} className="px-5 py-6 text-center text-sm text-slate-400 dark:text-slate-500">Нет записей</td></tr>
            ) : org.subscriptions.map((s) => (
              <tr key={s.id} className="border-b border-slate-50">
                <td className="px-5 py-2.5 text-slate-700 dark:text-slate-300">{s.plan.name}</td>
                <td className="px-5 py-2.5 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  {new Date(s.startedAt).toLocaleDateString("ru-RU")} → {new Date(s.expiresAt).toLocaleDateString("ru-RU")}
                </td>
                <td className="px-5 py-2.5 text-right font-medium text-emerald-600 dark:text-emerald-400">
                  {s.paidAmount.toLocaleString("ru-RU")} ₸
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Usage({ label, current, max, icon: Icon }: {
  label: string
  current: number
  max: number | null
  icon: React.ElementType
}) {
  const percent = max === null ? 0 : Math.min(100, Math.round((current / max) * 100))
  const isFull = max !== null && current >= max
  const isWarning = max !== null && percent >= 80

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          {label}
        </div>
        <div className="text-sm font-medium">
          <span className={cn(isFull ? "text-red-600 dark:text-red-400" : isWarning ? "text-amber-600 dark:text-amber-400" : "text-slate-900 dark:text-slate-100")}>
            {current}
          </span>
          <span className="text-slate-400 dark:text-slate-500"> / {max === null ? "∞" : max}</span>
        </div>
      </div>
      {max !== null && (
        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full transition-all",
              isFull ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-emerald-500"
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  )
}
