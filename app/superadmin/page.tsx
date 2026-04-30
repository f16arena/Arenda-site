export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import Link from "next/link"
import {
  Building2, Users, Package, TrendingUp, AlertTriangle, ArrowRight,
  ExternalLink, UserCheck, TrendingDown, Briefcase, Target,
} from "lucide-react"
import { ROOT_HOST } from "@/lib/host"

export default async function SuperadminHomePage() {
  await requirePlatformOwner()

  const now = new Date()
  const [
    totalOrgs,
    activeOrgs,
    suspendedOrgs,
    expiringOrgs,
    plansData,
    revenueAgg,
  ] = await Promise.all([
    db.organization.count().catch(() => 0),
    db.organization.count({ where: { isActive: true, isSuspended: false } }).catch(() => 0),
    db.organization.count({ where: { isSuspended: true } }).catch(() => 0),
    db.organization.count({
      where: {
        isActive: true,
        isSuspended: false,
        planExpiresAt: {
          gte: now,
          lte: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
        },
      },
    }).catch(() => 0),
    db.plan.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, code: true, name: true, priceMonthly: true,
        _count: { select: { organizations: true } },
      },
    }).catch(() => []),
    db.subscription.aggregate({
      where: { startedAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
      _sum: { paidAmount: true },
    }).catch(() => ({ _sum: { paidAmount: 0 } })),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Обзор платформы</h1>
        <p className="text-sm text-slate-500 mt-0.5">Метрики SaaS на {now.toLocaleDateString("ru-RU")}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="Всего организаций" value={totalOrgs} icon={Building2} color="purple" />
        <Card label="Активных" value={activeOrgs} icon={Users} color="emerald" sub={`${suspendedOrgs} приостановлено`} />
        <Card label="Истекают за 7 дней" value={expiringOrgs} icon={AlertTriangle} color="amber" />
        <Card label="MRR этого месяца" value={`${(revenueAgg._sum.paidAmount ?? 0).toLocaleString("ru-RU")} ₸`} icon={TrendingUp} color="blue" />
      </div>

      <KpiBlock />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Распределение по тарифам */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Package className="h-4 w-4 text-slate-400" />
              Распределение по тарифам
            </h2>
          </div>
          <div className="p-5 space-y-3">
            {plansData.map((p) => {
              const total = plansData.reduce((s, x) => s + x._count.organizations, 0) || 1
              const percent = Math.round((p._count.organizations / total) * 100)
              const mrr = p.priceMonthly * p._count.organizations
              return (
                <div key={p.id}>
                  <div className="flex items-center justify-between mb-1 text-sm">
                    <span className="font-medium text-slate-700">{p.name}</span>
                    <span className="text-slate-500">{p._count.organizations} ({percent}%) · {mrr.toLocaleString("ru-RU")} ₸</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 transition-all" style={{ width: `${percent}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <SubscriptionDynamics />
      </div>

      <TopOrgsByMrr />

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Последние действия (всех организаций)</h2>
        </div>
        <RecentAuditTable />
      </div>
    </div>
  )
}

async function TopOrgsByMrr() {
  const orgs = await db.organization.findMany({
    where: { isActive: true },
    select: {
      id: true, name: true, slug: true, isSuspended: true,
      plan: { select: { name: true, priceMonthly: true } },
      _count: { select: { buildings: true, users: true } },
    },
  }).catch(() => [])

  const sorted = orgs
    .map((o) => ({ ...o, mrr: o.plan?.priceMonthly ?? 0 }))
    .sort((a, b) => b.mrr - a.mrr || b._count.buildings - a._count.buildings)
    .slice(0, 5)

  if (sorted.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Топ организаций по MRR</h2>
        <Link href="/superadmin/orgs" className="text-xs text-purple-600 hover:underline flex items-center gap-1">
          Все организации <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/50">
            <th className="px-5 py-2 text-left text-xs font-medium text-slate-500">Организация</th>
            <th className="px-5 py-2 text-left text-xs font-medium text-slate-500">Тариф</th>
            <th className="px-5 py-2 text-right text-xs font-medium text-slate-500">MRR</th>
            <th className="px-5 py-2 text-right text-xs font-medium text-slate-500">Зданий</th>
            <th className="px-5 py-2 text-right text-xs font-medium text-slate-500">Юзеров</th>
            <th className="px-5 py-2" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((o) => (
            <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
              <td className="px-5 py-2.5">
                <Link href={`/superadmin/orgs/${o.id}`} className="font-medium text-slate-900 hover:text-purple-600">
                  {o.name}
                </Link>
                <div>
                  <a
                    href={`https://${o.slug}.${ROOT_HOST}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-slate-400 hover:text-blue-600 font-mono inline-flex items-center gap-0.5"
                  >
                    {o.slug}.{ROOT_HOST} <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </td>
              <td className="px-5 py-2.5 text-xs text-slate-600">{o.plan?.name ?? "—"}</td>
              <td className="px-5 py-2.5 text-right font-medium text-emerald-600">
                {o.mrr.toLocaleString("ru-RU")} ₸
              </td>
              <td className="px-5 py-2.5 text-right text-slate-600">{o._count.buildings}</td>
              <td className="px-5 py-2.5 text-right text-slate-600">{o._count.users}</td>
              <td className="px-5 py-2.5 text-right">
                {o.isSuspended && (
                  <span className="text-[10px] text-red-600 font-medium">приостановлен</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

async function SubscriptionDynamics() {
  const now = new Date()
  const months: { period: string; created: number; revenue: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    const period = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`
    const [created, revenue] = await Promise.all([
      db.organization.count({ where: { createdAt: { gte: start, lt: end } } }).catch(() => 0),
      db.subscription.aggregate({
        where: { startedAt: { gte: start, lt: end } },
        _sum: { paidAmount: true },
      }).then((r) => r._sum.paidAmount ?? 0).catch(() => 0),
    ])
    months.push({ period, created, revenue })
  }

  const maxRevenue = Math.max(...months.map((m) => m.revenue), 1)

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">Динамика выручки (6 мес)</h2>
      </div>
      <div className="p-5">
        <div className="flex items-end gap-2 h-32">
          {months.map((m) => {
            const h = (m.revenue / maxRevenue) * 100
            const monthName = new Date(m.period + "-01").toLocaleDateString("ru-RU", { month: "short" })
            return (
              <div key={m.period} className="flex-1 flex flex-col items-center gap-1">
                <div className="flex-1 w-full flex items-end">
                  <div
                    className="w-full bg-emerald-500 rounded-t hover:bg-emerald-600 transition"
                    style={{ height: `${h}%` }}
                    title={`${m.revenue.toLocaleString("ru-RU")} ₸ · ${m.created} новых`}
                  />
                </div>
                <p className="text-[10px] text-slate-500">{monthName}</p>
                <p className="text-[10px] text-emerald-600 font-medium">+{m.created}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

async function RecentAuditTable() {
  const logs = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      id: true, userName: true, userRole: true, action: true,
      entity: true, createdAt: true,
    },
  }).catch(() => [])

  if (logs.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-slate-400">Нет записей</p>
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 bg-slate-50">
          <th className="px-5 py-2 text-left text-xs font-medium text-slate-500">Время</th>
          <th className="px-5 py-2 text-left text-xs font-medium text-slate-500">Пользователь</th>
          <th className="px-5 py-2 text-left text-xs font-medium text-slate-500">Действие</th>
          <th className="px-5 py-2 text-left text-xs font-medium text-slate-500">Объект</th>
        </tr>
      </thead>
      <tbody>
        {logs.map((l) => (
          <tr key={l.id} className="border-b border-slate-50">
            <td className="px-5 py-2 text-xs text-slate-500">
              {new Date(l.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </td>
            <td className="px-5 py-2 text-slate-700">{l.userName ?? "—"} <span className="text-[10px] text-slate-400">{l.userRole}</span></td>
            <td className="px-5 py-2"><span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{l.action}</span></td>
            <td className="px-5 py-2 text-slate-500 text-xs">{l.entity}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

async function KpiBlock() {
  const now = new Date()
  const monthAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000)
  const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 3600 * 1000)

  const [
    totalUsers,
    totalTenants,
    paidSubsLast30,
    trialOrgsCreated30To60,
    convertedTo30,
    activeOrgs30Ago,
    deactivated30,
    avgPlanRevenue,
  ] = await Promise.all([
    // Активные пользователи на платформе (исключая платформ-админов)
    db.user.count({ where: { isActive: true, isPlatformOwner: false } }).catch(() => 0),
    // Всего арендаторов
    db.tenant.count().catch(() => 0),
    // Платных подписок (paymentMethod != TRIAL) за последние 30 дней
    db.subscription.count({
      where: {
        startedAt: { gte: monthAgo },
        paymentMethod: { not: "TRIAL" },
      },
    }).catch(() => 0),
    // Орги, созданные 30-60 дней назад (для конверсии trial → paid)
    db.organization.count({
      where: {
        createdAt: { gte: twoMonthsAgo, lt: monthAgo },
      },
    }).catch(() => 0),
    // Из них перешли на платный тариф (имеют subscription с paymentMethod != TRIAL)
    db.organization.count({
      where: {
        createdAt: { gte: twoMonthsAgo, lt: monthAgo },
        subscriptions: {
          some: { paymentMethod: { not: "TRIAL" } },
        },
      },
    }).catch(() => 0),
    // Сколько было активных орг на 30 дней назад
    db.organization.count({
      where: { createdAt: { lt: monthAgo }, isActive: true },
    }).catch(() => 0),
    // Сколько из них деактивировано за последние 30 дней
    db.organization.count({
      where: {
        createdAt: { lt: monthAgo },
        OR: [
          { isActive: false, updatedAt: { gte: monthAgo } },
          { isSuspended: true, updatedAt: { gte: monthAgo } },
        ],
      },
    }).catch(() => 0),
    // Средний MRR по активным платным
    db.organization.findMany({
      where: { isActive: true, isSuspended: false },
      select: { plan: { select: { priceMonthly: true } } },
    }).then((orgs) => {
      const paidOrgs = orgs.filter((o) => (o.plan?.priceMonthly ?? 0) > 0)
      if (paidOrgs.length === 0) return 0
      const total = paidOrgs.reduce((s, o) => s + (o.plan?.priceMonthly ?? 0), 0)
      return Math.round(total / paidOrgs.length)
    }).catch(() => 0),
  ])

  const conversionRate = trialOrgsCreated30To60 > 0
    ? Math.round((convertedTo30 / trialOrgsCreated30To60) * 100)
    : null
  const churnRate = activeOrgs30Ago > 0
    ? Math.round((deactivated30 / activeOrgs30Ago) * 100)
    : null

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Kpi
        icon={Target}
        color="emerald"
        label="Конверсия trial→paid"
        value={conversionRate !== null ? `${conversionRate}%` : "—"}
        sub={`${convertedTo30} из ${trialOrgsCreated30To60} за 30-60 дн.`}
      />
      <Kpi
        icon={TrendingDown}
        color={churnRate !== null && churnRate > 5 ? "red" : "slate"}
        label="Churn (30 дней)"
        value={churnRate !== null ? `${churnRate}%` : "—"}
        sub={`${deactivated30} ушло из ${activeOrgs30Ago}`}
      />
      <Kpi
        icon={UserCheck}
        color="blue"
        label="Активных юзеров"
        value={totalUsers}
        sub={`${paidSubsLast30} новых платных подписок`}
      />
      <Kpi
        icon={Briefcase}
        color="purple"
        label="Арендаторов"
        value={totalTenants}
        sub={`Сред. MRR: ${avgPlanRevenue.toLocaleString("ru-RU")} ₸`}
      />
    </div>
  )
}

function Kpi({ icon: Icon, color, label, value, sub }: {
  icon: React.ElementType
  color: "blue" | "emerald" | "amber" | "purple" | "red" | "slate"
  label: string
  value: string | number
  sub?: string
}) {
  const colors: Record<typeof color, string> = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-purple-50 text-purple-600",
    red: "bg-red-50 text-red-600",
    slate: "bg-slate-100 text-slate-600",
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <div className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${colors[color]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-xl font-bold text-slate-900">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function Card({ label, value, icon: Icon, color, sub }: {
  label: string
  value: string | number
  icon: React.ElementType
  color: "blue" | "emerald" | "amber" | "purple"
  sub?: string
}) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-purple-50 text-purple-600",
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${colors[color]} mb-3`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}
