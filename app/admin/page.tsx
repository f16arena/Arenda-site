export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { formatMoney } from "@/lib/utils"
import { getCurrentBuildingId } from "@/lib/current-building"
import {
  Users, Building2, TrendingUp, AlertTriangle,
  ClipboardList, CheckSquare, ArrowUpRight,
  Clock, Calendar as CalendarIcon, Mail, Wallet,
} from "lucide-react"
import Link from "next/link"
import { CashflowChart, type MonthData } from "@/components/dashboard/cashflow-chart"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { calculateTenantMonthlyRent } from "@/lib/rent"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"

export default async function AdminDashboard() {
  const { orgId } = await requireOrgAccess()
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

  const floorIds = await db.floor.findMany({
    where: { buildingId: { in: visibleBuildingIds } },
    select: { id: true },
  }).then((floors) => floors.map((f) => f.id)).catch(() => [] as string[])

  const tenantWhereInBuilding = {
    OR: [
      { space: { floorId: { in: floorIds } } },
      { fullFloors: { some: { buildingId: { in: visibleBuildingIds } } } },
    ],
  }

  const [
    tenantsCount,
    activeTenants,
    spacesGroup,
    chargesAgg,
    recentRequests,
    recentTasks,
    debtsByTenant,
    topTenants,
  ] = await Promise.all([
    db.tenant.count({ where: tenantWhereInBuilding }).catch(() => 0),
    db.tenant.findMany({
      where: tenantWhereInBuilding,
      select: {
        id: true,
        customRate: true,
        fixedMonthlyRent: true,
        space: { select: { area: true, floor: { select: { ratePerSqm: true } } } },
        fullFloors: { select: { fixedMonthlyRent: true } },
      },
    }).catch(() => [] as Array<{
      id: string
      customRate: number | null
      fixedMonthlyRent: number | null
      space: { area: number; floor: { ratePerSqm: number } } | null
      fullFloors: { fixedMonthlyRent: number | null }[]
    }>),
    db.space.groupBy({
      by: ["status"],
      where: { floorId: { in: floorIds } },
      _count: { _all: true },
    }).catch(() => [] as Array<{ status: string; _count: { _all: number } }>),
    db.charge.aggregate({
      where: {
        isPaid: false,
        tenant: tenantWhereInBuilding,
      },
      _sum: { amount: true },
      _count: { _all: true },
    }).catch(() => ({ _sum: { amount: 0 }, _count: { _all: 0 } })),
    db.request.findMany({
      where: {
        status: { in: ["NEW", "IN_PROGRESS"] },
        tenant: tenantWhereInBuilding,
      },
      select: { id: true, title: true, status: true },
      take: 5,
      orderBy: { createdAt: "desc" },
    }).catch(() => [] as Array<{ id: string; title: string; status: string }>),
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
    }).catch(() => [] as Array<{ id: string; title: string; status: string }>),
    db.charge.groupBy({
      by: ["tenantId"],
      where: {
        isPaid: false,
        tenant: tenantWhereInBuilding,
      },
      _sum: { amount: true },
    }).catch(() => [] as Array<{ tenantId: string; _sum: { amount: number | null } }>),
    db.tenant.findMany({
      where: tenantWhereInBuilding,
      select: {
        id: true,
        companyName: true,
        space: { select: { number: true } },
      },
      take: 6,
      orderBy: { createdAt: "desc" },
    }).catch(() => [] as Array<{ id: string; companyName: string; space: { number: string } | null }>),
  ])

  const occupiedSpaces = spacesGroup.find((s) => s.status === "OCCUPIED")?._count._all ?? 0
  const vacantSpaces = spacesGroup.find((s) => s.status === "VACANT")?._count._all ?? 0
  const totalDebt = chargesAgg._sum.amount ?? 0
  const debtCount = chargesAgg._count._all
  const monthlyRevenue = activeTenants.reduce((sum, t) => {
    return sum + calculateTenantMonthlyRent(t)
  }, 0)
  const debtMap = new Map(debtsByTenant.map((d) => [d.tenantId, d._sum.amount ?? 0]))

  // ── Cashflow: 6 прошлых + 6 будущих месяцев ──
  const months: MonthData[] = []
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

  // Все запросы параллельно для скорости + общий try/catch
  let pastData: { income: number; expense: number }[] = pastMonths.map(() => ({ income: 0, expense: 0 }))
  try {
    pastData = await Promise.all(pastMonths.map(async (m) => {
      const [paymentsAgg, expensesAgg] = await Promise.all([
        db.payment.aggregate({
          where: {
            paymentDate: { gte: m.start, lt: m.end },
            tenant: { space: { floorId: { in: floorIds } } },
          },
          _sum: { amount: true },
        }).catch(() => ({ _sum: { amount: 0 } })),
        db.expense.aggregate({
          where: { date: { gte: m.start, lt: m.end }, buildingId: { in: visibleBuildingIds } },
          _sum: { amount: true },
        }).catch(() => ({ _sum: { amount: 0 } })),
      ])
      return {
        income: paymentsAgg._sum.amount ?? 0,
        expense: expensesAgg._sum.amount ?? 0,
      }
    }))
  } catch { /* ignore */ }

  pastMonths.forEach((m, i) => {
    months.push({ period: m.period, income: pastData[i].income, expense: pastData[i].expense })
  })

  // Будущие месяцы — прогноз
  for (let i = 1; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    months.push({ period, income: monthlyRevenue, expense: monthlyRevenue * 0.3, forecast: true })
  }

  // ─── Блок "Сегодня" ────────────────────────────────────────────
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(todayStart.getTime() + 24 * 3600 * 1000)
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 3600 * 1000)
  const in30Days = new Date(todayStart.getTime() + 30 * 24 * 3600 * 1000)

  const [
    overdueCharges,
    expiringContracts,
    todayRequests,
    yesterdayPayments,
  ] = await Promise.all([
    db.charge.aggregate({
      where: {
        isPaid: false,
        dueDate: { lt: todayStart },
        tenant: tenantWhereInBuilding,
      },
      _sum: { amount: true },
      _count: { _all: true },
    }).catch(() => ({ _sum: { amount: 0 }, _count: { _all: 0 } })),
    db.tenant.count({
      where: {
        ...tenantWhereInBuilding,
        contractEnd: { gte: todayStart, lte: in30Days },
      },
    }).catch(() => 0),
    db.request.count({
      where: {
        createdAt: { gte: todayStart, lt: tomorrow },
        tenant: tenantWhereInBuilding,
      },
    }).catch(() => 0),
    db.payment.aggregate({
      where: {
        paymentDate: { gte: yesterdayStart, lt: todayStart },
        tenant: tenantWhereInBuilding,
      },
      _sum: { amount: true },
      _count: { _all: true },
    }).catch(() => ({ _sum: { amount: 0 }, _count: { _all: 0 } })),
  ])

  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const buildingBreakdown = await Promise.all(
    visibleBuildingIds.map(async (id) => {
      const building = await db.building.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          address: true,
          floors: {
            select: {
              id: true,
              spaces: { select: { id: true, status: true, kind: true } },
            },
          },
        },
      })

      if (!building) return null
      const ids = building.floors.map((f) => f.id)
      const buildingTenantWhere = {
        OR: [
          { space: { floorId: { in: ids } } },
          { fullFloors: { some: { buildingId: id } } },
        ],
      }
      const [incomeAgg, expenseAgg, tenantCount] = await Promise.all([
        db.payment.aggregate({
          where: {
            paymentDate: { gte: currentMonthStart, lt: nextMonthStart },
            tenant: buildingTenantWhere,
          },
          _sum: { amount: true },
        }).catch(() => ({ _sum: { amount: 0 } })),
        db.expense.aggregate({
          where: { date: { gte: currentMonthStart, lt: nextMonthStart }, buildingId: id },
          _sum: { amount: true },
        }).catch(() => ({ _sum: { amount: 0 } })),
        db.tenant.count({ where: buildingTenantWhere }).catch(() => 0),
      ])
      const rentable = building.floors.flatMap((f) => f.spaces).filter((s) => s.kind !== "COMMON")
      const occupied = rentable.filter((s) => s.status === "OCCUPIED").length
      const income = incomeAgg._sum.amount ?? 0
      const expenses = expenseAgg._sum.amount ?? 0

      return {
        id: building.id,
        name: building.name,
        address: building.address,
        income,
        expenses,
        profit: income - expenses,
        tenantCount,
        occupied,
        totalSpaces: rentable.length,
      }
    }),
  ).then((rows) => rows.filter(Boolean) as Array<{
    id: string
    name: string
    address: string
    income: number
    expenses: number
    profit: number
    tenantCount: number
    occupied: number
    totalSpaces: number
  }>)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Дашборд</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">
          {buildingId ? "Обзор выбранного здания" : `Обзор всех доступных зданий · ${visibleBuildingIds.length}`}
        </p>
      </div>

      {/* Сегодня */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          Сегодня
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
            href="/admin/finances/payments"
            icon={Wallet}
            color="emerald"
            label="Поступления"
            value={(yesterdayPayments._sum.amount ?? 0) > 0 ? formatMoney(yesterdayPayments._sum.amount ?? 0) : "Нет"}
            sub={`за вчера${(yesterdayPayments._count._all ?? 0) > 0 ? ` · ${yesterdayPayments._count._all} платеж(ей)` : ""}`}
          />
        </div>
      </div>

      {/* Cashflow chart */}
      <CashflowChart months={months} />

      {!buildingId && buildingBreakdown.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Разрез по зданиям за текущий месяц</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Здание</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Доход</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Расход</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Прибыль</th>
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
                  <td className="px-5 py-3 text-right text-slate-600 dark:text-slate-400">
                    {b.totalSpaces > 0 ? `${Math.round((b.occupied / b.totalSpaces) * 100)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                    {t.space ? `Каб. ${t.space.number}` : "—"}
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
