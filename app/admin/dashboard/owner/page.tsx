export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import {
  TrendingUp, TrendingDown, Wallet, Building2, AlertTriangle,
  ArrowRight, BarChart3,
} from "lucide-react"
import { formatMoney, CHART_COLORS } from "@/lib/utils"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { getCurrentBuildingId } from "@/lib/current-building"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { chargeScope, expenseScope, tenantScope } from "@/lib/tenant-scope"
import { calculateTenantRentChargeForPeriod } from "@/lib/rent"
import { safeServerValue } from "@/lib/server-fallback"
import { GroupedBarChart, GaugeBar, type MultiSeries } from "@/components/dashboard/simple-chart"

const MONTH_LABELS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"]

function periodFromDate(d: Date) {
  return d.toISOString().slice(0, 7)
}

function shiftMonth(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number)
  const idx = (y * 12 + (m - 1)) + delta
  const ny = Math.floor(idx / 12)
  const nm = (idx % 12) + 1
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}`
}

function periodLabel(period: string) {
  const [, m] = period.split("-")
  return MONTH_LABELS[parseInt(m) - 1] ?? period
}

export default async function OwnerDashboardPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")

  const { orgId } = await requireOrgAccess()
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin/dashboard/owner", orgId, userId: session.user.id })

  const buildingId = await getCurrentBuildingId()
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const visibleBuildingIds = buildingId ? [buildingId] : accessibleBuildingIds

  if (visibleBuildingIds.length === 0) {
    return (
      <div className="p-12 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-center text-slate-500 dark:text-slate-400">
        Нет доступных зданий
      </div>
    )
  }

  const now = new Date()
  const currentPeriod = periodFromDate(now)
  const last12: string[] = []
  for (let i = 11; i >= 0; i--) last12.push(shiftMonth(currentPeriod, -i))
  const next3: string[] = []
  for (let i = 1; i <= 3; i++) next3.push(shiftMonth(currentPeriod, i))

  const tenantBuildingWhere = {
    OR: [
      { space: { floor: { buildingId: { in: visibleBuildingIds } } } },
      { tenantSpaces: { some: { space: { floor: { buildingId: { in: visibleBuildingIds } } } } } },
      { fullFloors: { some: { buildingId: { in: visibleBuildingIds } } } },
    ],
  }

  // Charges grouped by period — paid revenue history.
  const [
    paidByPeriod,
    expenseByPeriod,
    spaceStats,
    activeTenantsForForecast,
    topDebtors,
    currentMonthCharges,
    currentMonthPayments,
    previousMonthPayments,
  ] = await Promise.all([
    safe(
      "owner.dashboard.paidByPeriod",
      db.charge.groupBy({
        by: ["period"],
        where: {
          AND: [chargeScope(orgId), { isPaid: true }, { period: { in: last12 } }, { tenant: tenantBuildingWhere }],
        },
        _sum: { amount: true },
      }),
      [] as { period: string; _sum: { amount: number | null } }[],
    ),
    safe(
      "owner.dashboard.expenseByPeriod",
      db.expense.groupBy({
        by: ["period"],
        where: { AND: [expenseScope(orgId), { period: { in: last12 } }, { buildingId: { in: visibleBuildingIds } }] },
        _sum: { amount: true },
      }),
      [] as { period: string; _sum: { amount: number | null } }[],
    ),
    safe(
      "owner.dashboard.spaceStats",
      db.space.groupBy({
        by: ["status"],
        where: { floor: { buildingId: { in: visibleBuildingIds } } },
        _count: { _all: true },
      }),
      [] as { status: string; _count: { _all: number } }[],
    ),
    safe(
      "owner.dashboard.activeTenants",
      db.tenant.findMany({
        where: { AND: [tenantScope(orgId), tenantBuildingWhere] },
        select: {
          id: true,
          fixedMonthlyRent: true,
          customRate: true,
          contractStart: true,
          contractEnd: true,
          paymentDueDay: true,
          space: {
            select: { area: true, floor: { select: { ratePerSqm: true } } },
          },
          tenantSpaces: {
            select: {
              space: { select: { area: true, floor: { select: { ratePerSqm: true } } } },
            },
          },
          fullFloors: { select: { fixedMonthlyRent: true } },
        },
      }),
      [],
    ),
    safe(
      "owner.dashboard.topDebtors",
      db.charge.groupBy({
        by: ["tenantId"],
        where: { AND: [chargeScope(orgId), { isPaid: false }, { tenant: tenantBuildingWhere }] },
        _sum: { amount: true },
        orderBy: { _sum: { amount: "desc" } },
        take: 5,
      }),
      [] as { tenantId: string; _sum: { amount: number | null } }[],
    ),
    safe(
      "owner.dashboard.currentMonthCharges",
      db.charge.aggregate({
        where: { AND: [chargeScope(orgId), { period: currentPeriod }, { tenant: tenantBuildingWhere }] },
        _sum: { amount: true },
      }),
      { _sum: { amount: 0 } },
    ),
    safe(
      "owner.dashboard.currentMonthPayments",
      db.charge.aggregate({
        where: { AND: [chargeScope(orgId), { period: currentPeriod }, { isPaid: true }, { tenant: tenantBuildingWhere }] },
        _sum: { amount: true },
      }),
      { _sum: { amount: 0 } },
    ),
    safe(
      "owner.dashboard.previousMonthPayments",
      db.charge.aggregate({
        where: {
          AND: [chargeScope(orgId), { period: shiftMonth(currentPeriod, -1) }, { isPaid: true }, { tenant: tenantBuildingWhere }],
        },
        _sum: { amount: true },
      }),
      { _sum: { amount: 0 } },
    ),
  ])

  // Build series — revenue & expense per month for last 12.
  const revenueMap = new Map<string, number>()
  paidByPeriod.forEach((r) => revenueMap.set(r.period, r._sum.amount ?? 0))
  const expenseMap = new Map<string, number>()
  expenseByPeriod.forEach((r) => expenseMap.set(r.period, r._sum.amount ?? 0))

  const groupedSeries: MultiSeries[] = last12.map((p) => {
    const rev = revenueMap.get(p) ?? 0
    const exp = expenseMap.get(p) ?? 0
    return {
      label: periodLabel(p),
      values: [
        { value: rev, color: CHART_COLORS.revenue, legend: "Выручка" },
        { value: exp, color: CHART_COLORS.expense, legend: "Расход" },
        { value: Math.max(rev - exp, 0), color: CHART_COLORS.profit, legend: "Прибыль" },
      ],
    }
  })

  // Occupancy.
  const totalSpaces = spaceStats.reduce((s, x) => s + x._count._all, 0)
  const occupiedSpaces = spaceStats.find((s) => s.status === "OCCUPIED")?._count._all ?? 0
  const occupancyRate = totalSpaces > 0 ? Math.round((occupiedSpaces / totalSpaces) * 100) : 0

  // Cashflow forecast — для каждого из next3 считаем сумму планируемых начислений.
  const forecastSeries: MultiSeries[] = next3.map((p) => {
    const rev = activeTenantsForForecast.reduce((sum, t) => {
      const sched = calculateTenantRentChargeForPeriod(t, p)
      return sum + (sched.shouldCreate ? sched.amount : 0)
    }, 0)
    return {
      label: periodLabel(p),
      values: [{ value: rev, color: CHART_COLORS.profit, legend: "Прогноз" }],
    }
  })

  // Top debtors info.
  const debtorIds = topDebtors.map((t) => t.tenantId)
  const debtorInfo = debtorIds.length > 0
    ? await safe(
        "owner.dashboard.debtorInfo",
        db.tenant.findMany({
          where: { id: { in: debtorIds } },
          select: { id: true, companyName: true },
        }),
        [] as { id: string; companyName: string }[],
      )
    : []
  const debtorsList = topDebtors.map((d) => {
    const info = debtorInfo.find((x) => x.id === d.tenantId)
    return {
      tenantId: d.tenantId,
      companyName: info?.companyName ?? "—",
      amount: d._sum.amount ?? 0,
    }
  })

  const totalDebt = topDebtors.reduce((s, d) => s + (d._sum.amount ?? 0), 0)

  const currentRevenue = currentMonthPayments._sum.amount ?? 0
  const previousRevenue = previousMonthPayments._sum.amount ?? 0
  const revenueChange = previousRevenue > 0
    ? Math.round(((currentRevenue - previousRevenue) / previousRevenue) * 100)
    : null

  const totalCharges = currentMonthCharges._sum.amount ?? 0

  const forecastTotal = forecastSeries.reduce((s, m) => s + (m.values[0]?.value ?? 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-500/10">
            <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Дашборд владельца</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Графики и прогноз cashflow по {visibleBuildingIds.length === 1 ? "зданию" : `${visibleBuildingIds.length} зданиям`}
            </p>
          </div>
        </div>
        <Link
          href="/admin/analytics"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
        >
          Полная аналитика <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={TrendingUp}
          label="Выручка месяц"
          value={formatMoney(currentRevenue)}
          sub={
            revenueChange === null
              ? `Прошлый: ${formatMoney(previousRevenue)}`
              : `${revenueChange >= 0 ? "+" : ""}${revenueChange}% к прошлому`
          }
          trend={revenueChange === null ? "neutral" : revenueChange >= 0 ? "up" : "down"}
        />
        <KpiCard
          icon={Building2}
          label="Заполняемость"
          value={`${occupancyRate}%`}
          sub={`${occupiedSpaces} из ${totalSpaces} помещений`}
          trend="neutral"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Долги"
          value={formatMoney(totalDebt)}
          sub={`${debtorsList.length} арендатора в топе`}
          trend={totalDebt > 0 ? "down" : "up"}
        />
        <KpiCard
          icon={Wallet}
          label="Прогноз 3 мес."
          value={formatMoney(forecastTotal)}
          sub="по активным договорам"
          trend="neutral"
        />
      </div>

      {/* Заполняемость */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">Заполняемость</h2>
        <GaugeBar
          percent={occupancyRate}
          label={`Занято ${occupiedSpaces} из ${totalSpaces}`}
          sub={`Свободных: ${Math.max(totalSpaces - occupiedSpaces, 0)} · ${currentPeriod}`}
        />
      </div>

      {/* Доход / расход / прибыль */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Выручка / Расходы / Прибыль за 12 месяцев
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Начисления оплаченные · Расходы за период · Прибыль = выручка − расходы
          </p>
        </div>
        <GroupedBarChart
          data={groupedSeries}
          height={200}
          legend={[
            { color: CHART_COLORS.revenue, label: "Выручка" },
            { color: CHART_COLORS.expense, label: "Расходы" },
            { color: CHART_COLORS.profit, label: "Прибыль" },
          ]}
        />
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Сумма за 12 мес.: выручка{" "}
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            {formatMoney(groupedSeries.reduce((s, g) => s + (g.values[0]?.value ?? 0), 0))}
          </span>
          {" · "}
          расходы{" "}
          <span className="font-medium text-red-600 dark:text-red-400">
            {formatMoney(groupedSeries.reduce((s, g) => s + (g.values[1]?.value ?? 0), 0))}
          </span>
        </p>
      </div>

      {/* Прогноз cashflow на 3 месяца */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Cashflow-прогноз на 3 месяца
          </h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">По активным договорам</p>
        </div>
        <GroupedBarChart
          data={forecastSeries}
          height={160}
          legend={[{ color: CHART_COLORS.profit, label: "Прогнозный доход" }]}
        />
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          Текущие начисления за {currentPeriod}: {formatMoney(totalCharges)}
        </p>
      </div>

      {/* Топ-5 должников */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Топ-5 должников</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">по сумме непогашенных начислений</p>
        </div>
        {debtorsList.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
            Нет должников — все начисления оплачены
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {debtorsList.map((d, i) => (
              <Link
                key={d.tenantId}
                href={`/admin/tenants/${d.tenantId}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300">
                    {i + 1}
                  </span>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{d.companyName}</p>
                </div>
                <p className="font-semibold text-red-600 dark:text-red-400">{formatMoney(d.amount)}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
}: {
  icon: React.ElementType
  label: string
  value: string
  sub: string
  trend: "up" | "down" | "neutral"
}) {
  const trendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : null
  const trendColor =
    trend === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : trend === "down"
        ? "text-red-600 dark:text-red-400"
        : "text-slate-400 dark:text-slate-500"
  const TrendIcon = trendIcon
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <Icon className="h-4 w-4" />
        </div>
        {TrendIcon && <TrendIcon className={`h-4 w-4 ${trendColor}`} />}
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-3">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
      <p className={`text-xs mt-1 ${trendColor}`}>{sub}</p>
    </div>
  )
}
