export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { getCurrentBuildingId } from "@/lib/current-building"
import { formatMoney } from "@/lib/utils"
import { TrendingUp, Users, Building2, Award, Activity, Wallet, AlertCircle, BarChart3, FileBarChart, Lock } from "lucide-react"
import { OccupancyHeatmap } from "./occupancy-heatmap"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { safeServerValue } from "@/lib/server-fallback"
import { calculateTenantMonthlyRent } from "@/lib/rent"

export default async function AnalyticsPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin/analytics", orgId, userId: session.user.id })

  const buildingId = await getCurrentBuildingId()
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const visibleBuildingIds = buildingId ? [buildingId] : accessibleBuildingIds
  if (visibleBuildingIds.length === 0) {
    return <div className="p-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-slate-500 dark:text-slate-400">Нет доступных зданий</div>
  }

  // Gate по тарифу: разбор фич плана.
  const orgForFeatures = await db.organization.findUnique({ where: { id: orgId }, select: { plan: { select: { features: true, name: true } } } })
  type Features = { analyticsBasic?: boolean; analyticsAdvanced?: boolean; analyticsCustomReports?: boolean }
  let features: Features = {}
  try { features = JSON.parse(orgForFeatures?.plan?.features ?? "{}") as Features } catch { /* ignore */ }
  if (!features.analyticsBasic) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10">
            <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Аналитика</h1>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-amber-100">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium text-amber-50">Аналитика доступна на тарифе Pro и выше</p>
              <p className="mt-1 text-sm text-amber-200">
                Текущий тариф: <b>{orgForFeatures?.plan?.name ?? "—"}</b>. На Pro появятся дашборд, прогноз cashflow, топ должников и заполняемость по времени.
                Чтобы повысить тариф — <Link href="/admin/subscription" className="underline">обратитесь к супер-админу</Link>.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }
  const advancedEnabled = !!features.analyticsAdvanced
  const customReportsEnabled = !!features.analyticsCustomReports

  const floorIds = await safe(
    "admin.analytics.floorIds",
    db.floor.findMany({ where: { buildingId: { in: visibleBuildingIds } }, select: { id: true } }).then((rows) => rows.map((f) => f.id)),
    [] as string[],
  )
  const tenantWhere = {
    user: { organizationId: orgId },
    OR: [
      { space: { floorId: { in: floorIds } } },
      { tenantSpaces: { some: { space: { floorId: { in: floorIds } } } } },
      { fullFloors: { some: { buildingId: { in: visibleBuildingIds } } } },
    ],
  }

  const now = new Date()
  const thisYear = now.getFullYear()
  const yearStart = new Date(thisYear, 0, 1)

  const [
    spaceStats,
    activeTenantsCount,
    contractDurations,
    paymentsThisYear,
    expensesThisYear,
    topPayersAgg,
    monthlyOccupancy,
  ] = await Promise.all([
    safe(
      "admin.analytics.spaceStats",
      db.space.groupBy({
        by: ["status"],
        where: { floorId: { in: floorIds } },
        _count: { _all: true },
      }),
      [],
    ),
    safe(
      "admin.analytics.activeTenantsCount",
      db.tenant.count({
        where: tenantWhere,
      }),
      0,
    ),
    safe(
      "admin.analytics.contractDurations",
      db.tenant.findMany({
        where: tenantWhere,
        select: { contractStart: true, contractEnd: true },
      }),
      [],
    ),
    safe(
      "admin.analytics.paymentsThisYear",
      db.payment.aggregate({
        where: { paymentDate: { gte: yearStart }, tenant: tenantWhere },
        _sum: { amount: true },
      }),
      { _sum: { amount: 0 } },
    ),
    safe(
      "admin.analytics.expensesThisYear",
      db.expense.aggregate({
        where: { date: { gte: yearStart }, buildingId: { in: visibleBuildingIds } },
        _sum: { amount: true },
      }),
      { _sum: { amount: 0 } },
    ),
    safe(
      "admin.analytics.topPayersAgg",
      db.payment.groupBy({
        by: ["tenantId"],
        where: { paymentDate: { gte: yearStart }, tenant: tenantWhere },
        _sum: { amount: true },
        orderBy: { _sum: { amount: "desc" } },
        take: 5,
      }),
      [],
    ),
    safe(
      "admin.analytics.monthlyOccupancy",
      db.tenant.findMany({
        where: tenantWhere,
        select: {
          space: { select: { id: true, number: true, area: true } },
          contractStart: true,
          contractEnd: true,
        },
      }),
      [],
    ),
  ])

  const totalSpaces = spaceStats.reduce((s, x) => s + x._count._all, 0) || 1
  const occupied = spaceStats.find((s) => s.status === "OCCUPIED")?._count._all ?? 0
  const occupancyRate = Math.round((occupied / totalSpaces) * 100)

  const completedContracts = contractDurations.filter((c) => c.contractStart && c.contractEnd)
  const avgDurationDays = completedContracts.length > 0
    ? completedContracts.reduce((s, c) => {
        const d = (c.contractEnd!.getTime() - c.contractStart!.getTime()) / 86_400_000
        return s + d
      }, 0) / completedContracts.length
    : 0
  const avgMonths = Math.round(avgDurationDays / 30)

  const totalRevenue = paymentsThisYear._sum.amount ?? 0
  const totalExpense = expensesThisYear._sum.amount ?? 0
  const profit = totalRevenue - totalExpense
  const margin = totalRevenue > 0 ? Math.round((profit / totalRevenue) * 100) : 0

  const topPayerIds = topPayersAgg.map((t) => t.tenantId)
  const topPayerInfo = await safe(
    "admin.analytics.topPayerInfo",
    db.tenant.findMany({
      where: { id: { in: topPayerIds } },
      select: { id: true, companyName: true },
    }),
    [],
  )
  const topPayers = topPayersAgg.map((t) => {
    const info = topPayerInfo.find((p) => p.id === t.tenantId)
    return { ...t, companyName: info?.companyName ?? "—" }
  })

  const occupancyData = monthlyOccupancy.map((t) => {
    if (!t.space || !t.contractStart) return null
    const start = new Date(Math.max(t.contractStart.getTime(), yearStart.getTime()))
    const end = t.contractEnd ? new Date(Math.min(t.contractEnd.getTime(), now.getTime())) : now
    const days = Math.max(0, (end.getTime() - start.getTime()) / 86_400_000)
    const yearDays = (now.getTime() - yearStart.getTime()) / 86_400_000
    const percent = Math.min(100, Math.round((days / yearDays) * 100))
    return {
      spaceId: t.space.id,
      spaceNumber: t.space.number,
      area: t.space.area,
      percent,
    }
  }).filter(Boolean) as { spaceId: string; spaceNumber: string; area: number; percent: number }[]

  // ===== analyticsBasic блоки =====
  // Топ-10 должников (по сумме неоплаченных начислений).
  const debtorAgg = await safe(
    "admin.analytics.debtorAgg",
    db.charge.groupBy({
      by: ["tenantId"],
      where: { isPaid: false, deletedAt: null, tenant: tenantWhere },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 10,
    }),
    [] as Array<{ tenantId: string; _sum: { amount: number | null } }>,
  )
  const debtorInfo = debtorAgg.length > 0
    ? await safe("admin.analytics.debtorInfo",
        db.tenant.findMany({ where: { id: { in: debtorAgg.map((d) => d.tenantId) } }, select: { id: true, companyName: true } }),
        [] as Array<{ id: string; companyName: string }>)
    : []
  const top10Debtors = debtorAgg.map((d) => ({
    tenantId: d.tenantId,
    companyName: debtorInfo.find((t) => t.id === d.tenantId)?.companyName ?? "—",
    total: d._sum.amount ?? 0,
  }))

  // Прогноз cashflow на 6 (и 12 для advanced) мес: сумма месячной аренды активных арендаторов.
  const activeTenants = await safe(
    "admin.analytics.activeTenants",
    db.tenant.findMany({
      where: { ...tenantWhere, OR: [{ contractEnd: null }, { contractEnd: { gte: now } }] },
      include: {
        space: { include: { floor: true } },
        fullFloors: true,
        tenantSpaces: { include: { space: { include: { floor: true } } } },
      },
    }),
    [],
  )
  const monthlyExpectedTotal = activeTenants.reduce((s, t) => s + calculateTenantMonthlyRent(t), 0)
  const cashflowForecast6 = monthlyExpectedTotal * 6
  const cashflowForecast12 = monthlyExpectedTotal * 12

  // ===== analyticsAdvanced блоки (только если фича включена) =====
  type PnL = { id: string; name: string; revenue: number; expense: number; profit: number }
  let plPerBuilding: PnL[] = []
  type AgeBuckets = { d0_30: number; d30_60: number; d60_90: number; d90plus: number }
  const aging: AgeBuckets = { d0_30: 0, d30_60: 0, d60_90: 0, d90plus: 0 }
  type BuildingCompare = { id: string; name: string; totalSpaces: number; occupied: number; occupiedPct: number; totalArea: number; revenue: number }
  let buildingsCompare: BuildingCompare[] = []

  if (advancedEnabled) {
    const buildings = await safe("admin.analytics.buildings",
      db.building.findMany({ where: { id: { in: visibleBuildingIds } }, select: { id: true, name: true } }),
      [] as Array<{ id: string; name: string }>)

    // P&L: revenue = платежи арендаторов здания за год; expense = расходы здания за год.
    plPerBuilding = await Promise.all(buildings.map(async (b) => {
      const tenantInBuildingWhere = {
        OR: [
          { space: { floor: { buildingId: b.id } } },
          { tenantSpaces: { some: { space: { floor: { buildingId: b.id } } } } },
          { fullFloors: { some: { buildingId: b.id } } },
        ],
      }
      const [rev, exp] = await Promise.all([
        db.payment.aggregate({
          where: { paymentDate: { gte: yearStart, lt: now }, tenant: tenantInBuildingWhere },
          _sum: { amount: true },
        }).catch(() => ({ _sum: { amount: 0 } })),
        db.expense.aggregate({
          where: { buildingId: b.id, date: { gte: yearStart, lt: now } },
          _sum: { amount: true },
        }).catch(() => ({ _sum: { amount: 0 } })),
      ])
      const revenue = rev._sum.amount ?? 0
      const expense = exp._sum.amount ?? 0
      return { id: b.id, name: b.name, revenue, expense, profit: revenue - expense }
    }))

    // Дебиторка по возрасту долга.
    const overdue = await safe("admin.analytics.aging",
      db.charge.findMany({
        where: { isPaid: false, deletedAt: null, dueDate: { lt: now }, tenant: tenantWhere },
        select: { amount: true, dueDate: true },
      }),
      [] as Array<{ amount: number; dueDate: Date | null }>)
    for (const c of overdue) {
      if (!c.dueDate) continue
      const days = Math.floor((now.getTime() - c.dueDate.getTime()) / 86_400_000)
      if (days < 30) aging.d0_30 += c.amount
      else if (days < 60) aging.d30_60 += c.amount
      else if (days < 90) aging.d60_90 += c.amount
      else aging.d90plus += c.amount
    }

    // Сравнение зданий: площадь, заполненность, доход.
    buildingsCompare = await Promise.all(buildings.map(async (b) => {
      const spaces = await db.space.findMany({
        where: { floor: { buildingId: b.id } },
        select: { area: true, status: true },
      })
      const total = spaces.length
      const occupied = spaces.filter((s) => s.status === "OCCUPIED").length
      const totalArea = spaces.reduce((s, sp) => s + sp.area, 0)
      const pl = plPerBuilding.find((p) => p.id === b.id)
      return {
        id: b.id, name: b.name,
        totalSpaces: total,
        occupied,
        occupiedPct: total > 0 ? Math.round((occupied / total) * 100) : 0,
        totalArea,
        revenue: pl?.revenue ?? 0,
      }
    }))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10">
          <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Аналитика</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Ключевые показатели за {thisYear} год</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Заполняемость" value={`${occupancyRate}%`} icon={Building2} sub={`${occupied} из ${totalSpaces} помещений`} color="blue" />
        <Kpi label="Доход за год" value={formatMoney(totalRevenue)} icon={TrendingUp} sub={`${activeTenantsCount} арендаторов`} color="emerald" />
        <Kpi label="Прибыль" value={formatMoney(profit)} icon={Award} sub={`Маржа ${margin}%`} color={profit >= 0 ? "emerald" : "red"} />
        <Kpi label="Средний срок" value={`${avgMonths} мес.`} icon={Users} sub="по подписанным договорам" color="purple" />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Топ-5 арендаторов по выручке за {thisYear}</h2>
        </div>
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">№</th>
              <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Арендатор</th>
              <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Сумма</th>
              <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">% от общей</th>
            </tr>
          </thead>
          <tbody>
            {topPayers.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-400 dark:text-slate-500">Нет платежей за этот год</td></tr>
            ) : topPayers.map((t, i) => {
              const amount = t._sum.amount ?? 0
              const percent = totalRevenue > 0 ? Math.round((amount / totalRevenue) * 100) : 0
              return (
                <tr key={t.tenantId} className="border-b border-slate-50">
                  <td className="px-5 py-2.5 text-slate-400 dark:text-slate-500">#{i + 1}</td>
                  <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-slate-100">{t.companyName}</td>
                  <td className="px-5 py-2.5 text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatMoney(amount)}</td>
                  <td className="px-5 py-2.5 text-right text-slate-500 dark:text-slate-400">{percent}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <OccupancyHeatmap data={occupancyData} />

      {/* ===== analyticsBasic: топ-10 должников и прогноз cashflow ===== */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Топ-10 должников</h2>
          </div>
          <table className="w-full min-w-[360px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">№</th>
                <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Арендатор</th>
                <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Долг</th>
              </tr>
            </thead>
            <tbody>
              {top10Debtors.length === 0 ? (
                <tr><td colSpan={3} className="px-5 py-6 text-center text-sm text-slate-400 dark:text-slate-500">Должников нет</td></tr>
              ) : top10Debtors.map((d, i) => (
                <tr key={d.tenantId} className="border-b border-slate-50">
                  <td className="px-5 py-2.5 text-slate-400 dark:text-slate-500">#{i + 1}</td>
                  <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-slate-100">{d.companyName}</td>
                  <td className="px-5 py-2.5 text-right font-semibold text-red-600 dark:text-red-400">{formatMoney(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Прогноз cashflow</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 p-5">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">На 6 месяцев</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(cashflowForecast6)}</p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">~{formatMoney(monthlyExpectedTotal)}/мес</p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">На 12 месяцев</p>
              {advancedEnabled ? (
                <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(cashflowForecast12)}</p>
              ) : (
                <p className="mt-1 text-sm text-slate-400 dark:text-slate-500 flex items-center gap-1"><Lock className="h-3 w-3" /> Business+</p>
              )}
            </div>
          </div>
          <p className="px-5 pb-4 text-[11px] text-slate-400 dark:text-slate-500">
            По активным договорам на сегодня. Не учитывает индексацию, расторжения и просрочки.
          </p>
        </div>
      </div>

      {/* ===== analyticsAdvanced (Business+) ===== */}
      {advancedEnabled ? (
        <>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-purple-600" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">P&L по объектам ({thisYear})</h2>
            </div>
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Здание</th>
                  <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Доход</th>
                  <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Расход</th>
                  <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Прибыль</th>
                </tr>
              </thead>
              <tbody>
                {plPerBuilding.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-6 text-center text-sm text-slate-400 dark:text-slate-500">Нет данных</td></tr>
                ) : plPerBuilding.map((b) => (
                  <tr key={b.id} className="border-b border-slate-50">
                    <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-slate-100">{b.name}</td>
                    <td className="px-5 py-2.5 text-right text-emerald-600 dark:text-emerald-400">{formatMoney(b.revenue)}</td>
                    <td className="px-5 py-2.5 text-right text-red-600 dark:text-red-400">{formatMoney(b.expense)}</td>
                    <td className={`px-5 py-2.5 text-right font-semibold ${b.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{formatMoney(b.profit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Дебиторка по возрасту долга</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 p-5">
                {[
                  { label: "0–30 дней", v: aging.d0_30, color: "text-amber-600 dark:text-amber-400" },
                  { label: "30–60 дней", v: aging.d30_60, color: "text-orange-600 dark:text-orange-400" },
                  { label: "60–90 дней", v: aging.d60_90, color: "text-red-600 dark:text-red-400" },
                  { label: "90+ дней", v: aging.d90plus, color: "text-red-700 dark:text-red-500" },
                ].map((b) => (
                  <div key={b.label} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{b.label}</p>
                    <p className={`mt-1 text-lg font-bold ${b.color}`}>{formatMoney(b.v)}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
              <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Сравнение зданий</h2>
              </div>
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Здание</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Площадь</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Заполн.</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Доход/год</th>
                  </tr>
                </thead>
                <tbody>
                  {buildingsCompare.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">Нет данных</td></tr>
                  ) : buildingsCompare.map((b) => (
                    <tr key={b.id} className="border-b border-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">{b.name}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{b.totalArea.toLocaleString("ru-RU")} м²</td>
                      <td className="px-4 py-2.5 text-right text-slate-700 dark:text-slate-300">{b.occupied}/{b.totalSpaces} ({b.occupiedPct}%)</td>
                      <td className="px-4 py-2.5 text-right text-emerald-600 dark:text-emerald-400">{formatMoney(b.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-5">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-4 w-4 text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Расширенная аналитика — на тарифе Business</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                P&L по каждому объекту, дебиторка по возрасту долга, сравнение зданий, прогноз cashflow на 12 месяцев.
                <Link href="/admin/subscription" className="ml-1 text-blue-600 dark:text-blue-400 underline">Обновить тариф</Link>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===== analyticsCustomReports (Business+ с фичей) ===== */}
      {customReportsEnabled ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-start gap-3">
            <FileBarChart className="mt-0.5 h-4 w-4 text-purple-600" />
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Кастомные отчёты</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Шаблоны под вашу форму (например, выгрузка для УК), регулярная отправка по email/Telegram, экспорт в Power BI / Tableau через API.
                <Link href="/admin/subscription" className="ml-1 text-blue-600 dark:text-blue-400 underline">Заказать — свяжитесь с супер-админом</Link>
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Kpi({ label, value, icon: Icon, sub, color }: {
  label: string
  value: string
  icon: React.ElementType
  sub: string
  color: "blue" | "emerald" | "red" | "purple"
}) {
  const colors = {
    blue: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
    emerald: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    red: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400",
    purple: "bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400",
  }
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${colors[color]} mb-3`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>
    </div>
  )
}
