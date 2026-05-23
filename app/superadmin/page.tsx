export const dynamic = "force-dynamic"

import { Suspense } from "react"
import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import Link from "next/link"
import {
  Building2, Users, Package, TrendingUp, AlertTriangle, ArrowRight,
  ExternalLink, UserCheck, TrendingDown, Briefcase, Target, Sparkles, Clock,
} from "lucide-react"
import { ROOT_HOST } from "@/lib/host"
import { safeServerValue } from "@/lib/server-fallback"

export default async function SuperadminHomePage() {
  const { userId } = await requirePlatformOwner()
  const now = new Date()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Обзор платформы</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Метрики SaaS на {now.toLocaleDateString("ru-RU")}</p>
      </div>

      <Suspense fallback={<CardsSkeleton count={4} />}>
        <PlatformOverviewCards userId={userId} />
      </Suspense>

      <Suspense fallback={<CardsSkeleton count={4} />}>
        <KpiBlock userId={userId} />
      </Suspense>

      <Suspense fallback={<div className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />}>
        <ActionableCards userId={userId} />
      </Suspense>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Suspense fallback={<PanelSkeleton />}>
          <PlansDistribution userId={userId} />
        </Suspense>
        <Suspense fallback={<PanelSkeleton />}>
          <SubscriptionDynamics userId={userId} />
        </Suspense>
      </div>

      <Suspense fallback={<PanelSkeleton />}>
        <TopOrgsByMrr userId={userId} />
      </Suspense>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Последние действия (всех организаций)</h2>
        </div>
        <Suspense fallback={<div className="px-5 py-8 text-center text-sm text-slate-400 dark:text-slate-500">Загрузка…</div>}>
          <RecentAuditTable userId={userId} />
        </Suspense>
      </div>
    </div>
  )
}

async function PlatformOverviewCards({ userId }: { userId: string }) {
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/superadmin", userId })
  const now = new Date()
  const [totalOrgs, activeOrgs, suspendedOrgs, expiringOrgs, revenueAgg] = await Promise.all([
    safe("superadmin.home.totalOrgs", db.organization.count(), 0),
    safe("superadmin.home.activeOrgs", db.organization.count({ where: { isActive: true, isSuspended: false } }), 0),
    safe("superadmin.home.suspendedOrgs", db.organization.count({ where: { isSuspended: true } }), 0),
    safe(
      "superadmin.home.expiringOrgs",
      db.organization.count({
        where: {
          isActive: true,
          isSuspended: false,
          planExpiresAt: { gte: now, lte: new Date(now.getTime() + 7 * 24 * 3600 * 1000) },
        },
      }),
      0,
    ),
    safe(
      "superadmin.home.revenueAggregate",
      db.subscription.aggregate({
        where: { startedAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } },
        _sum: { paidAmount: true },
      }),
      { _sum: { paidAmount: 0 } },
    ),
  ])

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card label="Всего организаций" value={totalOrgs} icon={Building2} color="purple" />
      <Card label="Активных" value={activeOrgs} icon={Users} color="emerald" sub={`${suspendedOrgs} приостановлено`} />
      <Card label="Истекают за 7 дней" value={expiringOrgs} icon={AlertTriangle} color="amber" />
      <Card label="MRR этого месяца" value={`${(revenueAgg._sum.paidAmount ?? 0).toLocaleString("ru-RU")} ₸`} icon={TrendingUp} color="blue" />
    </div>
  )
}

async function PlansDistribution({ userId }: { userId: string }) {
  const plansData = await safeServerValue(
    db.plan.findMany({
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, code: true, name: true, priceMonthly: true,
        _count: { select: { organizations: true } },
      },
    }),
    [] as Array<{ id: string; code: string; name: string; priceMonthly: number; _count: { organizations: number } }>,
    { source: "superadmin.home.plansData", route: "/superadmin", userId },
  )

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Package className="h-4 w-4 text-slate-400 dark:text-slate-500" />
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
                <span className="font-medium text-slate-700 dark:text-slate-300">{p.name}</span>
                <span className="text-slate-500 dark:text-slate-400">{p._count.organizations} ({percent}%) · {mrr.toLocaleString("ru-RU")} ₸</span>
              </div>
              <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 transition-all" style={{ width: `${percent}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CardsSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  )
}

function PanelSkeleton() {
  return <div className="h-48 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
}

async function TopOrgsByMrr({ userId }: { userId: string }) {
  const orgs = await safeServerValue(
    db.organization.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, slug: true, isSuspended: true,
        plan: { select: { name: true, priceMonthly: true } },
        _count: { select: { buildings: true, users: true } },
      },
    }),
    [],
    { source: "superadmin.home.topOrgsByMrr", route: "/superadmin", userId },
  )

  const sorted = orgs
    .map((o) => ({ ...o, mrr: o.plan?.priceMonthly ?? 0 }))
    .sort((a, b) => b.mrr - a.mrr || b._count.buildings - a._count.buildings)
    .slice(0, 5)

  if (sorted.length === 0) return null

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Топ организаций по MRR</h2>
        <Link href="/superadmin/orgs" className="text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1">
          Все организации <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50/50">
            <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Организация</th>
            <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Тариф</th>
            <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">MRR</th>
            <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Зданий</th>
            <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Юзеров</th>
            <th className="px-5 py-2" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((o) => (
            <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50/50 transition">
              <td className="px-5 py-2.5">
                <Link href={`/superadmin/orgs/${o.id}`} className="font-medium text-slate-900 dark:text-slate-100 hover:text-purple-600 dark:text-purple-400">
                  {o.name}
                </Link>
                <div>
                  <a
                    href={`https://${o.slug}.${ROOT_HOST}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:text-blue-400 font-mono inline-flex items-center gap-0.5"
                  >
                    {o.slug}.{ROOT_HOST} <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </td>
              <td className="px-5 py-2.5 text-xs text-slate-600 dark:text-slate-400">{o.plan?.name ?? "—"}</td>
              <td className="px-5 py-2.5 text-right font-medium text-emerald-600 dark:text-emerald-400">
                {o.mrr.toLocaleString("ru-RU")} ₸
              </td>
              <td className="px-5 py-2.5 text-right text-slate-600 dark:text-slate-400">{o._count.buildings}</td>
              <td className="px-5 py-2.5 text-right text-slate-600 dark:text-slate-400">{o._count.users}</td>
              <td className="px-5 py-2.5 text-right">
                {o.isSuspended && (
                  <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">приостановлен</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

async function SubscriptionDynamics({ userId }: { userId: string }) {
  const now = new Date()
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)

  // 2 запроса вместо 12: тянем строки за 6-месячное окно и раскладываем по месяцам в JS.
  const [orgRows, subRows] = await Promise.all([
    safeServerValue(
      db.organization.findMany({ where: { createdAt: { gte: windowStart } }, select: { createdAt: true } }),
      [] as Array<{ createdAt: Date }>,
      { source: "superadmin.home.subscriptionDynamics.orgs", route: "/superadmin", userId },
    ),
    safeServerValue(
      db.subscription.findMany({ where: { startedAt: { gte: windowStart } }, select: { startedAt: true, paidAmount: true } }),
      [] as Array<{ startedAt: Date; paidAmount: number }>,
      { source: "superadmin.home.subscriptionDynamics.subs", route: "/superadmin", userId },
    ),
  ])

  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  const months: { period: string; created: number; revenue: number }[] = []
  const indexByPeriod = new Map<string, number>()
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const period = monthKey(start)
    indexByPeriod.set(period, months.length)
    months.push({ period, created: 0, revenue: 0 })
  }
  for (const o of orgRows) {
    const k = indexByPeriod.get(monthKey(new Date(o.createdAt)))
    if (k !== undefined) months[k].created += 1
  }
  for (const s of subRows) {
    const k = indexByPeriod.get(monthKey(new Date(s.startedAt)))
    if (k !== undefined) months[k].revenue += s.paidAmount ?? 0
  }

  const maxRevenue = Math.max(...months.map((m) => m.revenue), 1)

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Динамика выручки (6 мес)</h2>
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
                <p className="text-[10px] text-slate-500 dark:text-slate-400">{monthName}</p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">+{m.created}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

async function RecentAuditTable({ userId }: { userId: string }) {
  const logs = await safeServerValue(
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true, userName: true, userRole: true, action: true,
        entity: true, createdAt: true,
      },
    }),
    [],
    { source: "superadmin.home.recentAudit", route: "/superadmin", userId },
  )

  if (logs.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-slate-400 dark:text-slate-500">Нет записей</p>
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Время</th>
          <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Пользователь</th>
          <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Действие</th>
          <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Объект</th>
        </tr>
      </thead>
      <tbody>
        {logs.map((l) => (
          <tr key={l.id} className="border-b border-slate-50">
            <td className="px-5 py-2 text-xs text-slate-500 dark:text-slate-400">
              {new Date(l.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </td>
            <td className="px-5 py-2 text-slate-700 dark:text-slate-300">{l.userName ?? "—"} <span className="text-[10px] text-slate-400 dark:text-slate-500">{l.userRole}</span></td>
            <td className="px-5 py-2"><span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">{l.action}</span></td>
            <td className="px-5 py-2 text-slate-500 dark:text-slate-400 text-xs">{l.entity}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

async function KpiBlock({ userId }: { userId: string }) {
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
    safeServerValue(
      db.user.count({ where: { isActive: true, isPlatformOwner: false } }),
      0,
      { source: "superadmin.home.kpi.totalUsers", route: "/superadmin", userId },
    ),
    // Всего арендаторов
    safeServerValue(db.tenant.count(), 0, { source: "superadmin.home.kpi.totalTenants", route: "/superadmin", userId }),
    // Платных подписок (paymentMethod != TRIAL) за последние 30 дней
    safeServerValue(
      db.subscription.count({
        where: {
          startedAt: { gte: monthAgo },
          paymentMethod: { not: "TRIAL" },
        },
      }),
      0,
      { source: "superadmin.home.kpi.paidSubsLast30", route: "/superadmin", userId },
    ),
    // Орги, созданные 30-60 дней назад (для конверсии trial → paid)
    safeServerValue(
      db.organization.count({
        where: {
          createdAt: { gte: twoMonthsAgo, lt: monthAgo },
        },
      }),
      0,
      { source: "superadmin.home.kpi.trialOrgsCreated30To60", route: "/superadmin", userId },
    ),
    // Из них перешли на платный тариф (имеют subscription с paymentMethod != TRIAL)
    safeServerValue(
      db.organization.count({
        where: {
          createdAt: { gte: twoMonthsAgo, lt: monthAgo },
          subscriptions: {
            some: { paymentMethod: { not: "TRIAL" } },
          },
        },
      }),
      0,
      { source: "superadmin.home.kpi.convertedTo30", route: "/superadmin", userId },
    ),
    // Сколько было активных орг на 30 дней назад
    safeServerValue(
      db.organization.count({
        where: { createdAt: { lt: monthAgo }, isActive: true },
      }),
      0,
      { source: "superadmin.home.kpi.activeOrgs30Ago", route: "/superadmin", userId },
    ),
    // Сколько из них деактивировано за последние 30 дней
    safeServerValue(
      db.organization.count({
        where: {
          createdAt: { lt: monthAgo },
          OR: [
            { isActive: false, updatedAt: { gte: monthAgo } },
            { isSuspended: true, updatedAt: { gte: monthAgo } },
          ],
        },
      }),
      0,
      { source: "superadmin.home.kpi.deactivated30", route: "/superadmin", userId },
    ),
    // Средний MRR по активным платным
    safeServerValue(
      db.organization.findMany({
        where: { isActive: true, isSuspended: false },
        select: { plan: { select: { priceMonthly: true } } },
      }).then((orgs) => {
        const paidOrgs = orgs.filter((o) => (o.plan?.priceMonthly ?? 0) > 0)
        if (paidOrgs.length === 0) return 0
        const total = paidOrgs.reduce((s, o) => s + (o.plan?.priceMonthly ?? 0), 0)
        return Math.round(total / paidOrgs.length)
      }),
      0,
      { source: "superadmin.home.kpi.avgPlanRevenue", route: "/superadmin", userId },
    ),
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

async function ActionableCards({ userId }: { userId: string }) {
  const [pendingAddons, foundersTaken, foundersTotal, foundersActive] = await Promise.all([
    safeServerValue(
      db.organizationAddon.count({ where: { isActive: false, expiresAt: null } }),
      0,
      { source: "superadmin.home.pendingAddons", route: "/superadmin", userId },
    ),
    safeServerValue(
      db.foundersProgramState.findUnique({ where: { id: "singleton" }, select: { takenSlots: true } }).then((s) => s?.takenSlots ?? 0),
      0,
      { source: "superadmin.home.foundersTaken", route: "/superadmin", userId },
    ),
    safeServerValue(
      db.foundersProgramState.findUnique({ where: { id: "singleton" }, select: { totalSlots: true } }).then((s) => s?.totalSlots ?? 15),
      15,
      { source: "superadmin.home.foundersTotal", route: "/superadmin", userId },
    ),
    safeServerValue(
      db.foundersProgramState.findUnique({ where: { id: "singleton" }, select: { isActive: true } }).then((s) => s?.isActive ?? true),
      true,
      { source: "superadmin.home.foundersActive", route: "/superadmin", userId },
    ),
  ])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Link
        href="/superadmin/addons?status=pending"
        className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 hover:border-amber-500 dark:hover:border-amber-500/50 transition"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Заявки на аддоны</span>
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {pendingAddons} <span className="text-sm font-normal text-slate-400 dark:text-slate-500">в обработке</span>
            </p>
          </div>
          <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-amber-500 transition" />
        </div>
      </Link>

      <Link
        href="/superadmin/founders"
        className="group bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 hover:border-amber-500 dark:hover:border-amber-500/50 transition"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Founders Pricing</span>
              {!foundersActive && <span className="text-[10px] text-red-500 font-medium">выкл.</span>}
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {foundersTaken} / {foundersTotal} <span className="text-sm font-normal text-slate-400 dark:text-slate-500">слотов</span>
            </p>
          </div>
          <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-amber-500 transition" />
        </div>
      </Link>
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
    blue: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
    emerald: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
    purple: "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400",
    red: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400",
    slate: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
  }
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
        <div className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${colors[color]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
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
    blue: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
    emerald: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
    purple: "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400",
  }
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${colors[color]} mb-3`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}
