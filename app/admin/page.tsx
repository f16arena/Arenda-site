export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { formatMoney } from "@/lib/utils"
import { getCurrentBuildingId } from "@/lib/current-building"
import {
  Users, Building2, TrendingUp, AlertTriangle,
  ClipboardList, CheckSquare, ArrowUpRight,
  Clock, Calendar as CalendarIcon, Mail, Wallet,
  ClipboardCheck, ShieldCheck, FileSpreadsheet, Printer,
  FileSignature,
} from "lucide-react"
import Link from "next/link"
import { CashflowChart, type MonthData } from "@/components/dashboard/cashflow-chart"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { getOnboardingState } from "@/lib/onboarding"
import { getOwnerBuildingMetrics } from "@/lib/owner-dashboard"
import { measureServerRoute, measureServerStep } from "@/lib/server-performance"
import { safeServerValue } from "@/lib/server-fallback"
import type { Prisma } from "@/app/generated/prisma/client"

type AttentionItem = {
  href: string
  title: string
  value: string
  sub: string
  tone: "red" | "amber" | "blue" | "emerald"
  active: boolean
}

export default async function AdminDashboard() {
  return measureServerRoute("/admin", async () => {
  const { orgId } = await requireOrgAccess()
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin", orgId })
  const buildingId = await getCurrentBuildingId()
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const visibleBuildingIds = buildingId ? [buildingId] : accessibleBuildingIds

  if (visibleBuildingIds.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center">
        <Building2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-700 dark:text-slate-300 font-semibold mb-1">Нет доступных зданий</p>
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mb-4">Создайте здание или назначьте пользователя на нужные здания</p>
        <Link href="/admin/buildings" className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          К списку зданий
        </Link>
      </div>
    )
  }

  const floorIds = await safe(
    "admin.dashboard.floorIds",
    db.floor.findMany({
      where: { buildingId: { in: visibleBuildingIds } },
      select: { id: true },
    }).then((floors) => floors.map((f) => f.id)),
    [] as string[],
  )

  const tenantWhereInBuilding: Prisma.TenantWhereInput = {
    user: { organizationId: orgId },
    OR: [
      { space: { floorId: { in: floorIds } } },
      { tenantSpaces: { some: { space: { floorId: { in: floorIds } } } } },
      { fullFloors: { some: { buildingId: { in: visibleBuildingIds } } } },
    ],
  }

  const now = new Date()
  const pastMonths: { period: string; start: Date; end: Date }[] = []
  for (let i = -5; i <= 0; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    pastMonths.push({
      period: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      start: new Date(d.getFullYear(), d.getMonth(), 1),
      end: new Date(d.getFullYear(), d.getMonth() + 1, 1),
    })
  }

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(todayStart.getTime() + 24 * 3600 * 1000)
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 3600 * 1000)
  const in30Days = new Date(todayStart.getTime() + 30 * 24 * 3600 * 1000)
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const baseMetricsPromise = Promise.all([
    safe("admin.dashboard.tenantsCount", db.tenant.count({ where: tenantWhereInBuilding }), 0),
    safe(
      "admin.dashboard.activeTenants",
      db.tenant.findMany({
        where: tenantWhereInBuilding,
        select: {
          id: true,
          customRate: true,
          fixedMonthlyRent: true,
          space: { select: { area: true, floor: { select: { ratePerSqm: true } } } },
          tenantSpaces: {
            select: {
              space: { select: { area: true, floor: { select: { ratePerSqm: true } } } },
            },
          },
          fullFloors: { select: { fixedMonthlyRent: true } },
        },
      }),
      [] as Array<{
        id: string
        customRate: number | null
        fixedMonthlyRent: number | null
        space: { area: number; floor: { ratePerSqm: number } } | null
        tenantSpaces: { space: { area: number; floor: { ratePerSqm: number } } }[]
        fullFloors: { fixedMonthlyRent: number | null }[]
      }>,
    ),
    safe(
      "admin.dashboard.spacesGroup",
      db.space.groupBy({
        by: ["status"],
        where: { floorId: { in: floorIds } },
        _count: { _all: true },
      }),
      [] as Array<{ status: string; _count: { _all: number } }>,
    ),
    safe(
      "admin.dashboard.chargesAggregate",
      db.charge.aggregate({
        where: {
          isPaid: false,
          tenant: tenantWhereInBuilding,
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      { _sum: { amount: 0 }, _count: { _all: 0 } },
    ),
    safe(
      "admin.dashboard.recentRequests",
      db.request.findMany({
        where: {
          status: { in: ["NEW", "IN_PROGRESS"] },
          tenant: tenantWhereInBuilding,
        },
        select: { id: true, title: true, status: true },
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
      [] as Array<{ id: string; title: string; status: string }>,
    ),
    safe(
      "admin.dashboard.recentTasks",
      db.task.findMany({
        where: {
          status: { in: ["NEW", "IN_PROGRESS"] },
          OR: [
            { buildingId: { in: visibleBuildingIds } },
            { buildingId: null, createdBy: { organizationId: orgId } },
          ],
        },
        select: { id: true, title: true, status: true },
        take: 5,
        orderBy: { createdAt: "desc" },
      }),
      [] as Array<{ id: string; title: string; status: string }>,
    ),
    safe(
      "admin.dashboard.debtsByTenant",
      db.charge.groupBy({
        by: ["tenantId"],
        where: {
          isPaid: false,
          tenant: tenantWhereInBuilding,
        },
        _sum: { amount: true },
      }),
      [] as Array<{ tenantId: string; _sum: { amount: number | null } }>,
    ),
    safe(
      "admin.dashboard.topTenants",
      db.tenant.findMany({
        where: tenantWhereInBuilding,
        select: {
          id: true,
          companyName: true,
          space: { select: { number: true } },
          tenantSpaces: { select: { space: { select: { number: true } } }, take: 3, orderBy: { createdAt: "asc" } },
          fullFloors: { select: { number: true, name: true }, take: 3, orderBy: { number: "asc" } },
        },
        take: 6,
        orderBy: { createdAt: "desc" },
      }),
      [] as Array<{
        id: string
        companyName: string
        space: { number: string } | null
        tenantSpaces: { space: { number: string } }[]
        fullFloors: { number: number; name: string }[]
      }>,
    ),
    safe("admin.dashboard.onboarding", getOnboardingState(orgId), {
      allDone: true,
      nextStep: null,
      nextRequiredStep: null,
      steps: [],
      doneCount: 0,
      totalCount: 0,
      requiredCount: 0,
      doneRequiredCount: 0,
      recommendedCount: 0,
      doneRecommendedCount: 0,
      percent: 100,
    }),
  ])

  const pastDataPromise = Promise.all(pastMonths.map(async (m) => {
    const [paymentsAgg, expensesAgg] = await Promise.all([
      safe(
        "admin.dashboard.monthlyPayments",
        db.payment.aggregate({
          where: {
            paymentDate: { gte: m.start, lt: m.end },
            tenant: tenantWhereInBuilding,
          },
          _sum: { amount: true },
        }),
        { _sum: { amount: 0 } },
      ),
      safe(
        "admin.dashboard.monthlyExpenses",
        db.expense.aggregate({
          where: { date: { gte: m.start, lt: m.end }, buildingId: { in: visibleBuildingIds } },
          _sum: { amount: true },
        }),
        { _sum: { amount: 0 } },
      ),
    ])
    return {
      income: paymentsAgg._sum.amount ?? 0,
      expense: expensesAgg._sum.amount ?? 0,
    }
  }))

  const todayMetricsPromise = Promise.all([
    safe(
      "admin.dashboard.overdueCharges",
      db.charge.aggregate({
        where: {
          isPaid: false,
          dueDate: { lt: todayStart },
          tenant: tenantWhereInBuilding,
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      { _sum: { amount: 0 }, _count: { _all: 0 } },
    ),
    safe(
      "admin.dashboard.pendingPaymentReports",
      db.paymentReport.aggregate({
        where: {
          status: { in: ["PENDING", "DISPUTED"] },
          tenant: tenantWhereInBuilding,
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      { _sum: { amount: 0 }, _count: { _all: 0 } },
    ),
    safe("admin.dashboard.dataQualityIssues", (async () => {
      const [
        doubleRentCount,
        missingContactCount,
        noSignedContractCount,
        chargeMissingDueDateCount,
        occupiedWithoutTenantCount,
        vacantWithTenantCount,
      ] = await Promise.all([
        db.tenant.count({
          where: {
            AND: [
              tenantWhereInBuilding,
              { customRate: { gt: 0 }, fixedMonthlyRent: { gt: 0 } },
            ],
          },
        }),
        db.tenant.count({
          where: {
            AND: [
              tenantWhereInBuilding,
              { OR: [{ user: { email: null } }, { user: { email: "" } }] },
              { OR: [{ user: { phone: null } }, { user: { phone: "" } }] },
            ],
          },
        }),
        db.tenant.count({
          where: {
            AND: [
              tenantWhereInBuilding,
              { OR: [{ spaceId: { not: null } }, { tenantSpaces: { some: {} } }, { fullFloors: { some: {} } }] },
              { contracts: { none: { status: "SIGNED" } } },
            ],
          },
        }),
        db.charge.count({
          where: {
            isPaid: false,
            dueDate: null,
            tenant: tenantWhereInBuilding,
          },
        }),
        db.space.count({
          where: {
            kind: "RENTABLE",
            status: "OCCUPIED",
            tenant: { is: null },
            tenantSpaces: { none: {} },
            floor: { buildingId: { in: visibleBuildingIds }, fullFloorTenantId: null },
          },
        }),
        db.space.count({
          where: {
            kind: "RENTABLE",
            status: "VACANT",
            OR: [{ tenant: { isNot: null } }, { tenantSpaces: { some: {} } }],
            floorId: { in: floorIds },
          },
        }),
      ])

      return doubleRentCount
        + missingContactCount
        + noSignedContractCount
        + chargeMissingDueDateCount
        + occupiedWithoutTenantCount
        + vacantWithTenantCount
    })(), 0),
    safe(
      "admin.dashboard.expiringContracts",
      db.tenant.count({
        where: {
          ...tenantWhereInBuilding,
          contractEnd: { gte: todayStart, lte: in30Days },
        },
      }),
      0,
    ),
    safe(
      "admin.dashboard.todayRequests",
      db.request.count({
        where: {
          createdAt: { gte: todayStart, lt: tomorrow },
          tenant: tenantWhereInBuilding,
        },
      }),
      0,
    ),
    safe(
      "admin.dashboard.yesterdayPayments",
      db.payment.aggregate({
        where: {
          paymentDate: { gte: yesterdayStart, lt: todayStart },
          tenant: tenantWhereInBuilding,
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      { _sum: { amount: 0 }, _count: { _all: 0 } },
    ),
    safe(
      "admin.dashboard.openRequestsCount",
      db.request.count({
        where: {
          status: { in: ["NEW", "IN_PROGRESS"] },
          tenant: tenantWhereInBuilding,
        },
      }),
      0,
    ),
    safe(
      "admin.dashboard.openTasksCount",
      db.task.count({
        where: {
          status: { in: ["NEW", "IN_PROGRESS"] },
          OR: [
            { buildingId: { in: visibleBuildingIds } },
            { buildingId: null, createdBy: { organizationId: orgId } },
          ],
        },
      }),
      0,
    ),
    safe(
      "admin.dashboard.documentsOnSignature",
      db.contract.count({
        where: {
          status: { in: ["SENT", "VIEWED", "SIGNED_BY_TENANT"] },
          tenant: tenantWhereInBuilding,
        },
      }),
      0,
    ),
  ])

  const buildingBreakdownPromise = safe(
    "admin.dashboard.buildingBreakdown",
    getOwnerBuildingMetrics({
      buildingIds: visibleBuildingIds,
      from: currentMonthStart,
      to: nextMonthStart,
    }),
    [],
  )

  const [
    [
      tenantsCount,
      activeTenants,
      spacesGroup,
      chargesAgg,
      recentRequests,
      recentTasks,
      debtsByTenant,
      topTenants,
      onboarding,
    ],
    pastData,
    [
      overdueCharges,
      pendingPaymentReports,
      dataQualityIssues,
      expiringContracts,
      todayRequests,
      yesterdayPayments,
      openRequestsCount,
      openTasksCount,
      documentsOnSignature,
    ],
    buildingBreakdown,
  ] = await Promise.all([
    measureServerStep("/admin", "base-metrics", baseMetricsPromise),
    measureServerStep("/admin", "cashflow-history", pastDataPromise),
    measureServerStep("/admin", "today-metrics", todayMetricsPromise),
    measureServerStep("/admin", "building-breakdown", buildingBreakdownPromise),
  ])

  const occupiedSpaces = spacesGroup.find((s) => s.status === "OCCUPIED")?._count._all ?? 0
  const vacantSpaces = spacesGroup.find((s) => s.status === "VACANT")?._count._all ?? 0
  const totalDebt = chargesAgg._sum.amount ?? 0
  const debtCount = chargesAgg._count._all
  const monthlyRevenue = activeTenants.reduce((sum, t) => {
    return sum + calculateTenantMonthlyRent(t)
  }, 0)
  const debtMap = new Map(debtsByTenant.map((d) => [d.tenantId, d._sum.amount ?? 0]))
  const portfolioTotals = buildingBreakdown.reduce(
    (acc, building) => ({
      income: acc.income + building.income,
      expenses: acc.expenses + building.expenses,
      profit: acc.profit + building.profit,
      debt: acc.debt + building.debt,
      vacantArea: acc.vacantArea + building.vacantArea,
      totalArea: acc.totalArea + building.totalArea,
      occupiedArea: acc.occupiedArea + building.occupiedArea,
    }),
    { income: 0, expenses: 0, profit: 0, debt: 0, vacantArea: 0, totalArea: 0, occupiedArea: 0 },
  )
  const portfolioOccupancy = portfolioTotals.totalArea > 0
    ? Math.round((portfolioTotals.occupiedArea / portfolioTotals.totalArea) * 100)
    : null
  const mostDebtBuilding = [...buildingBreakdown].sort((a, b) => b.debt - a.debt)[0] ?? null
  const bestProfitBuilding = [...buildingBreakdown].sort((a, b) => b.profit - a.profit)[0] ?? null

  const months: MonthData[] = []

  pastMonths.forEach((m, i) => {
    months.push({ period: m.period, income: pastData[i].income, expense: pastData[i].expense })
  })

  // Будущие месяцы — прогноз
  for (let i = 1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    months.push({ period, income: monthlyRevenue, expense: monthlyRevenue * 0.3, forecast: true })
  }

  const attentionItems: AttentionItem[] = [
    {
      href: "/admin/finances?filter=overdue",
      title: "Просроченные платежи",
      value: (overdueCharges._count._all ?? 0) > 0 ? `${overdueCharges._count._all} шт` : "Нет",
      sub: (overdueCharges._sum.amount ?? 0) > 0 ? formatMoney(overdueCharges._sum.amount ?? 0) : "Все спокойно",
      tone: "red" as const,
      active: (overdueCharges._count._all ?? 0) > 0,
    },
    {
      href: "/admin/finances",
      title: "Оплаты на проверке",
      value: (pendingPaymentReports._count._all ?? 0) > 0 ? `${pendingPaymentReports._count._all} шт` : "Нет",
      sub: (pendingPaymentReports._sum.amount ?? 0) > 0 ? formatMoney(pendingPaymentReports._sum.amount ?? 0) : "Новых чеков нет",
      tone: "emerald" as const,
      active: (pendingPaymentReports._count._all ?? 0) > 0,
    },
    {
      href: "/admin/data-quality",
      title: "Ошибки в данных",
      value: dataQualityIssues > 0 ? `${dataQualityIssues} шт` : "Нет",
      sub: dataQualityIssues > 0 ? "Проверьте аренду, контакты и договоры" : "Критичных ошибок нет",
      tone: "amber" as const,
      active: dataQualityIssues > 0,
    },
    {
      href: "/admin/tenants?filter=expiring",
      title: "Договоры заканчиваются",
      value: expiringContracts > 0 ? `${expiringContracts} шт` : "Нет",
      sub: "Ближайшие 30 дней",
      tone: "blue" as const,
      active: expiringContracts > 0,
    },
  ].sort((left, right) => Number(right.active) - Number(left.active))
  const ownerPrimaryAction = attentionItems.find((item) => item.active) ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Дашборд</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">
          {buildingId ? "Обзор выбранного здания" : `Обзор всех доступных зданий · ${visibleBuildingIds.length}`}
        </p>
      </div>

      {!onboarding.allDone && onboarding.nextStep && (
        <Link
          href="/admin/onboarding"
          className="block rounded-xl border border-blue-200 bg-blue-50 p-4 transition hover:border-blue-300 hover:bg-blue-100/70 dark:border-blue-500/30 dark:bg-blue-500/10 dark:hover:bg-blue-500/15"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 dark:bg-slate-900 dark:text-blue-300">
                <ClipboardCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-blue-950 dark:text-blue-100">Запуск платформы: {onboarding.percent}%</p>
                <p className="mt-0.5 text-sm text-blue-700 dark:text-blue-200">
                  Следующий шаг: {onboarding.nextStep.title.toLowerCase()}.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-2 w-36 overflow-hidden rounded-full bg-white/80 dark:bg-slate-800">
                <div className="h-full rounded-full bg-blue-600" style={{ width: `${onboarding.percent}%` }} />
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 dark:text-blue-200">
                Открыть чеклист
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </div>
          </div>
        </Link>
      )}

      {/* Сегодня */}
      {!buildingId && buildingBreakdown.length > 0 && (
        <OwnerPortfolioSummary
          buildingsCount={buildingBreakdown.length}
          income={portfolioTotals.income}
          expenses={portfolioTotals.expenses}
          profit={portfolioTotals.profit}
          debt={portfolioTotals.debt}
          vacantArea={portfolioTotals.vacantArea}
          occupancyPercent={portfolioOccupancy}
          bestProfitBuilding={bestProfitBuilding ? { name: bestProfitBuilding.name, amount: bestProfitBuilding.profit } : null}
          mostDebtBuilding={mostDebtBuilding && mostDebtBuilding.debt > 0 ? { name: mostDebtBuilding.name, amount: mostDebtBuilding.debt } : null}
        />
      )}

      <OwnerNextActionCard action={ownerPrimaryAction} />

      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          Сегодня
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <TodayCard
            href="/admin/finances?filter=overdue"
            icon={AlertTriangle}
            color="red"
            label="Просроченные платежи"
            value={(overdueCharges._count._all ?? 0) > 0 ? `${overdueCharges._count._all} шт` : "Нет"}
            sub={(overdueCharges._sum.amount ?? 0) > 0 ? formatMoney(overdueCharges._sum.amount ?? 0) : "—"}
            urgent={(overdueCharges._count._all ?? 0) > 0}
          />
          <TodayCard
            href="/admin/finances"
            icon={Wallet}
            color="emerald"
            label="Оплаты на проверке"
            value={(pendingPaymentReports._count._all ?? 0) > 0 ? `${pendingPaymentReports._count._all} шт` : "Нет"}
            sub={(pendingPaymentReports._sum.amount ?? 0) > 0 ? formatMoney(pendingPaymentReports._sum.amount ?? 0) : "—"}
            urgent={(pendingPaymentReports._count._all ?? 0) > 0}
          />
          <TodayCard
            href="/admin/data-quality"
            icon={ShieldCheck}
            color="amber"
            label="Ошибки в данных"
            value={dataQualityIssues > 0 ? `${dataQualityIssues} шт` : "Нет"}
            sub="проверка аренды, контактов и договоров"
            urgent={dataQualityIssues > 0}
          />
          <TodayCard
            href="/admin/tenants?filter=expiring"
            icon={CalendarIcon}
            color="amber"
            label="Истекают договоры"
            value={expiringContracts > 0 ? `${expiringContracts} шт` : "Нет"}
            sub="за 30 дней"
            urgent={expiringContracts > 0}
          />
          <TodayCard
            href="/admin/requests"
            icon={Mail}
            color="blue"
            label="Новые заявки"
            value={todayRequests > 0 ? `${todayRequests} шт` : "Нет"}
            sub="за сегодня"
          />
          <TodayCard
            href="/admin/finances"
            icon={Wallet}
            color="emerald"
            label="Поступления"
            value={(yesterdayPayments._sum.amount ?? 0) > 0 ? formatMoney(yesterdayPayments._sum.amount ?? 0) : "Нет"}
            sub={`за вчера${(yesterdayPayments._count._all ?? 0) > 0 ? ` · ${yesterdayPayments._count._all} платеж(ей)` : ""}`}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Требует внимания сегодня</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Самые важные действия по выбранным зданиям, чтобы владелец сразу видел, где нужны деньги, документы или проверка.
          </p>
        </div>
        <div className="grid gap-3 p-4 lg:grid-cols-4">
          {attentionItems.map((item) => (
            <AttentionRow key={item.href} {...item} />
          ))}
        </div>
      </div>

      <AdminWorkdayPanel
        overdueCount={overdueCharges._count._all ?? 0}
        overdueAmount={overdueCharges._sum.amount ?? 0}
        paymentReportsCount={pendingPaymentReports._count._all ?? 0}
        paymentReportsAmount={pendingPaymentReports._sum.amount ?? 0}
        openRequestsCount={openRequestsCount}
        openTasksCount={openTasksCount}
        documentsOnSignature={documentsOnSignature}
      />

      {/* Cashflow chart */}
      <CashflowChart months={months} />

      {!buildingId && buildingBreakdown.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="flex flex-col gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Разрез по зданиям за текущий месяц</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Доход, расход, прибыль, долг и свободная площадь по каждой точке.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/api/export/owner-report?format=xlsx"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </Link>
              <Link
                href="/api/export/owner-report?format=html"
                target="_blank"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <Printer className="h-4 w-4" />
                PDF/печать
              </Link>
            </div>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Здание</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Доход</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Расход</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Прибыль</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Долг</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Свободно</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Заполняемость</th>
              </tr>
            </thead>
            <tbody>
              {buildingBreakdown.map((b) => (
                <tr key={b.id} className="border-b border-slate-50 dark:border-slate-800/70">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{b.name}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">{b.address} · {b.tenantCount} арендаторов</p>
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-emerald-600 dark:text-emerald-400">{formatMoney(b.income)}</td>
                  <td className="px-5 py-3 text-right font-medium text-orange-600 dark:text-orange-400">{formatMoney(b.expenses)}</td>
                  <td className={`px-5 py-3 text-right font-semibold ${b.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {formatMoney(b.profit)}
                  </td>
                  <td className={`px-5 py-3 text-right font-medium ${b.debt > 0 ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`}>
                    {b.debt > 0 ? formatMoney(b.debt) : "—"}
                    {b.debtCount > 0 && <span className="block text-[11px] font-normal text-slate-400">{b.debtCount} шт</span>}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-600 dark:text-slate-400">
                    {formatArea(b.vacantArea)}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-600 dark:text-slate-400">
                    {b.occupancyPercent !== null ? `${b.occupancyPercent}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Арендаторы"
          value={String(activeTenants.length)}
          sub={`из ${tenantsCount} зарегистрированных`}
          icon={Users}
          color="blue"
        />
        <StatCard
          label="Занято помещений"
          value={String(occupiedSpaces)}
          sub={`${vacantSpaces} свободно`}
          icon={Building2}
          color="teal"
        />
        <StatCard
          label="Доход в месяц"
          value={formatMoney(monthlyRevenue)}
          sub="расчётный"
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          label="Общий долг"
          value={formatMoney(totalDebt)}
          sub={`${debtCount} неоплаченных`}
          icon={AlertTriangle}
          color="red"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              Активные заявки
            </h2>
            <Link href="/admin/requests" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5">
              Все <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {recentRequests.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">Нет активных заявок</p>
          ) : (
            <ul className="space-y-2">
              {recentRequests.map((r) => (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-300 truncate">{r.title}</span>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-slate-400 dark:text-slate-500" />
              Задачи
            </h2>
            <Link href="/admin/tasks" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5">
              Все <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {recentTasks.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">Нет активных задач</p>
          ) : (
            <ul className="space-y-2">
              {recentTasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 dark:text-slate-300 truncate">{t.title}</span>
                  <StatusBadge status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Арендаторы</h2>
          <Link href="/admin/tenants" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5">
            Все <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Компания</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Помещение</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Долг</th>
            </tr>
          </thead>
          <tbody>
            {topTenants.map((t) => {
              const debt = debtMap.get(t.id) ?? 0
              return (
                <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-900 dark:text-slate-100">{t.companyName}</td>
                  <td className="px-5 py-3 text-slate-500 dark:text-slate-400 dark:text-slate-500">
                    {describeTenantPlacement(t)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {debt > 0 ? (
                      <span className="text-red-600 dark:text-red-400 font-medium">{formatMoney(debt)}</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">Нет долга</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
  })
}

function OwnerPortfolioSummary({
  buildingsCount,
  income,
  expenses,
  profit,
  debt,
  vacantArea,
  occupancyPercent,
  bestProfitBuilding,
  mostDebtBuilding,
}: {
  buildingsCount: number
  income: number
  expenses: number
  profit: number
  debt: number
  vacantArea: number
  occupancyPercent: number | null
  bestProfitBuilding: { name: string; amount: number } | null
  mostDebtBuilding: { name: string; amount: number } | null
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Картина владельца по всем зданиям</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {buildingsCount} зданий в текущем разрезе: доход, расход, прибыль, долг и свободная площадь.
          </p>
        </div>
        <Link
          href="/api/export/owner-report?format=xlsx"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Отчет Excel
        </Link>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <PortfolioStat label="Доход" value={formatMoney(income)} tone="emerald" />
        <PortfolioStat label="Расход" value={formatMoney(expenses)} tone="orange" />
        <PortfolioStat label="Прибыль" value={formatMoney(profit)} tone={profit >= 0 ? "emerald" : "red"} />
        <PortfolioStat label="Долг" value={debt > 0 ? formatMoney(debt) : "Нет"} tone={debt > 0 ? "red" : "slate"} />
        <PortfolioStat label="Свободно" value={formatArea(vacantArea)} tone="blue" />
        <PortfolioStat label="Заполняемость" value={occupancyPercent === null ? "—" : `${occupancyPercent}%`} tone="slate" />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          Лучшее здание по прибыли: <b>{bestProfitBuilding ? `${bestProfitBuilding.name} · ${formatMoney(bestProfitBuilding.amount)}` : "данных пока нет"}</b>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          Самый большой долг: <b>{mostDebtBuilding ? `${mostDebtBuilding.name} · ${formatMoney(mostDebtBuilding.amount)}` : "критичных долгов нет"}</b>
        </div>
      </div>
    </section>
  )
}

function PortfolioStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "emerald" | "orange" | "red" | "blue" | "slate"
}) {
  const colors = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    orange: "text-orange-600 dark:text-orange-400",
    red: "text-red-600 dark:text-red-400",
    blue: "text-blue-600 dark:text-blue-400",
    slate: "text-slate-900 dark:text-slate-100",
  }
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <p className={`truncate text-lg font-bold ${colors[tone]}`}>{value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  )
}

function OwnerNextActionCard({ action }: { action: AttentionItem | null }) {
  if (!action) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/25 dark:bg-emerald-500/10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              Главное действие владельца
            </p>
            <h2 className="mt-1 text-lg font-semibold text-emerald-950 dark:text-emerald-100">
              Критичных действий сейчас нет
            </h2>
            <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-200">
              Долги, проверки оплат, документы и качество данных в норме по текущему срезу.
            </p>
          </div>
          <Link
            href="/admin/ops"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Открыть рабочий день
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    )
  }

  const colors = {
    red: "border-red-200 bg-red-50 text-red-950 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100",
    amber: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100",
    blue: "border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100",
  }
  const buttonColors = {
    red: "bg-red-600 hover:bg-red-700",
    amber: "bg-amber-600 hover:bg-amber-700",
    blue: "bg-blue-600 hover:bg-blue-700",
    emerald: "bg-emerald-600 hover:bg-emerald-700",
  }

  return (
    <section className={`rounded-xl border p-4 ${colors[action.tone]}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-75">Главное действие владельца</p>
          <h2 className="mt-1 text-lg font-semibold">{action.title}: {action.value}</h2>
          <p className="mt-1 text-sm opacity-80">{action.sub}</p>
        </div>
        <Link
          href={action.href}
          className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white ${buttonColors[action.tone]}`}
        >
          Перейти
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  )
}

function AdminWorkdayPanel({
  overdueCount,
  overdueAmount,
  paymentReportsCount,
  paymentReportsAmount,
  openRequestsCount,
  openTasksCount,
  documentsOnSignature,
}: {
  overdueCount: number
  overdueAmount: number
  paymentReportsCount: number
  paymentReportsAmount: number
  openRequestsCount: number
  openTasksCount: number
  documentsOnSignature: number
}) {
  const totalActions = overdueCount + paymentReportsCount + openRequestsCount + openTasksCount + documentsOnSignature

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Рабочий день администратора</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Операционный список: что проверить, кому ответить и какие документы довести до подписи.
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
          totalActions > 0
            ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
        }`}>
          {totalActions > 0 ? `${totalActions} действий` : "Все спокойно"}
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <WorkdayAction
          href="/admin/finances?filter=overdue"
          icon={AlertTriangle}
          label="Собрать долги"
          value={overdueCount > 0 ? `${overdueCount} проср.` : "Нет"}
          sub={overdueAmount > 0 ? formatMoney(overdueAmount) : "просрочек нет"}
          urgent={overdueCount > 0}
        />
        <WorkdayAction
          href="/admin/finances"
          icon={Wallet}
          label="Проверить оплаты"
          value={paymentReportsCount > 0 ? `${paymentReportsCount} заявок` : "Нет"}
          sub={paymentReportsAmount > 0 ? formatMoney(paymentReportsAmount) : "чеков нет"}
          urgent={paymentReportsCount > 0}
        />
        <WorkdayAction
          href="/admin/requests"
          icon={ClipboardList}
          label="Разобрать заявки"
          value={openRequestsCount > 0 ? `${openRequestsCount} открыто` : "Нет"}
          sub="арендаторы ждут ответа"
          urgent={openRequestsCount > 0}
        />
        <WorkdayAction
          href="/admin/tasks"
          icon={CheckSquare}
          label="Закрыть задачи"
          value={openTasksCount > 0 ? `${openTasksCount} в работе` : "Нет"}
          sub="операционные задачи"
          urgent={openTasksCount > 0}
        />
        <WorkdayAction
          href="/admin/documents"
          icon={FileSignature}
          label="Довести подписи"
          value={documentsOnSignature > 0 ? `${documentsOnSignature} док.` : "Нет"}
          sub="ожидают сторону"
          urgent={documentsOnSignature > 0}
        />
      </div>
    </section>
  )
}

function WorkdayAction({
  href,
  icon: Icon,
  label,
  value,
  sub,
  urgent,
}: {
  href: string
  icon: React.ElementType
  label: string
  value: string
  sub: string
  urgent: boolean
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg border p-3 transition hover:-translate-y-0.5 hover:shadow-sm ${
        urgent
          ? "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10"
          : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <Icon className={`mt-0.5 h-4 w-4 ${urgent ? "text-amber-600 dark:text-amber-300" : "text-slate-400"}`} />
        <ArrowUpRight className="h-3.5 w-3.5 text-slate-300" />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">{label}</p>
      <p className="mt-0.5 truncate text-[11px] text-slate-400 dark:text-slate-500">{sub}</p>
    </Link>
  )
}

function AttentionRow({
  href,
  title,
  value,
  sub,
  tone,
  active,
}: {
  href: string
  title: string
  value: string
  sub: string
  tone: "red" | "amber" | "blue" | "emerald"
  active: boolean
}) {
  const colors = {
    red: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
    amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
    blue: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
  }

  return (
    <Link
      href={href}
      className={`rounded-lg border p-3 transition hover:-translate-y-0.5 hover:shadow-sm ${
        active ? colors[tone] : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium opacity-80">{title}</p>
          <p className="mt-1 text-lg font-bold">{value}</p>
          <p className="mt-0.5 truncate text-[11px] opacity-75">{sub}</p>
        </div>
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </div>
    </Link>
  )
}

function TodayCard({
  href, icon: Icon, color, label, value, sub, urgent,
}: {
  href: string
  icon: React.ElementType
  color: "red" | "amber" | "blue" | "emerald"
  label: string
  value: string
  sub: string
  urgent?: boolean
}) {
  const colors = {
    red: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30",
    amber: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30",
    blue: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30",
    emerald: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30",
  }
  return (
    <Link
      href={href}
      className={`block bg-white dark:bg-slate-900 rounded-xl border p-4 transition hover:shadow-sm ${urgent ? "border-red-200 dark:border-red-500/30 ring-1 ring-red-100" : "border-slate-200 dark:border-slate-800"}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${colors[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <ArrowUpRight className="h-3.5 w-3.5 text-slate-300" />
      </div>
      <p className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">{value}</p>
      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-0.5">{label}</p>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{sub}</p>
    </Link>
  )
}

function StatCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string
  value: string
  sub: string
  icon: React.ElementType
  color: "blue" | "teal" | "green" | "red"
}) {
  const colors = {
    blue: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
    teal: "bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400",
    green: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    red: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400",
  }
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${colors[color]} mb-3`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">{label}</p>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>
    </div>
  )
}

function describeTenantPlacement(tenant: {
  space: { number: string } | null
  tenantSpaces: { space: { number: string } }[]
  fullFloors: { number: number; name: string }[]
}) {
  if (tenant.fullFloors.length > 0) {
    return tenant.fullFloors.map((floor) => floor.name || `${floor.number} этаж`).join(", ")
  }

  const rooms = tenant.tenantSpaces.length > 0
    ? tenant.tenantSpaces.map((item) => item.space.number)
    : tenant.space
      ? [tenant.space.number]
      : []

  return rooms.length > 0 ? rooms.map((number) => `Каб. ${number}`).join(", ") : "—"
}

function formatArea(value: number) {
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)} м²`
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    NEW: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300",
    IN_PROGRESS: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300",
    DONE: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  }
  const label: Record<string, string> = {
    NEW: "Новая",
    IN_PROGRESS: "В работе",
    DONE: "Готово",
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500"}`}>
      {label[status] ?? status}
    </span>
  )
}
