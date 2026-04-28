export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { formatMoney } from "@/lib/utils"
import { getCurrentBuildingId } from "@/lib/current-building"
import {
  Users, Building2, TrendingUp, AlertTriangle,
  ClipboardList, CheckSquare, ArrowUpRight,
} from "lucide-react"
import Link from "next/link"
import { CashflowChart, type MonthData } from "@/components/dashboard/cashflow-chart"

export default async function AdminDashboard() {
  const buildingId = await getCurrentBuildingId()
  if (!buildingId) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
        <Building2 className="h-10 w-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-700 font-semibold mb-1">Здание не выбрано</p>
        <p className="text-sm text-slate-500 mb-4">Создайте здание чтобы начать работу</p>
        <Link href="/admin/buildings" className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          К списку зданий
        </Link>
      </div>
    )
  }
  // Получим список этажей текущего здания для фильтра
  const floorIds = (await db.floor.findMany({
    where: { buildingId },
    select: { id: true },
  })).map((f) => f.id)

  // Все запросы фильтруем по floorIds (помещения этого здания)
  const tenantWhereInBuilding = {
    OR: [
      { space: { floorId: { in: floorIds } } },
      { fullFloors: { some: { id: { in: floorIds } } } },
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
    db.tenant.count({ where: tenantWhereInBuilding }),
    db.tenant.findMany({
      where: { spaceId: { not: null }, space: { floorId: { in: floorIds } } },
      select: { id: true, customRate: true, space: { select: { area: true } } },
    }),
    db.space.groupBy({
      by: ["status"],
      where: { floorId: { in: floorIds } },
      _count: { _all: true },
    }),
    db.charge.aggregate({
      where: {
        isPaid: false,
        tenant: tenantWhereInBuilding,
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.request.findMany({
      where: {
        status: { in: ["NEW", "IN_PROGRESS"] },
        tenant: tenantWhereInBuilding,
      },
      select: { id: true, title: true, status: true },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    db.task.findMany({
      where: {
        status: { in: ["NEW", "IN_PROGRESS"] },
        OR: [{ buildingId }, { buildingId: null }],
      },
      select: { id: true, title: true, status: true },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    db.charge.groupBy({
      by: ["tenantId"],
      where: {
        isPaid: false,
        tenant: tenantWhereInBuilding,
      },
      _sum: { amount: true },
    }),
    db.tenant.findMany({
      where: { spaceId: { not: null }, space: { floorId: { in: floorIds } } },
      select: {
        id: true,
        companyName: true,
        space: { select: { number: true } },
      },
      take: 6,
      orderBy: { createdAt: "desc" },
    }),
  ])

  const occupiedSpaces = spacesGroup.find((s) => s.status === "OCCUPIED")?._count._all ?? 0
  const vacantSpaces = spacesGroup.find((s) => s.status === "VACANT")?._count._all ?? 0
  const totalDebt = chargesAgg._sum.amount ?? 0
  const debtCount = chargesAgg._count._all
  const monthlyRevenue = activeTenants.reduce((sum, t) => {
    return sum + (t.space?.area ?? 0) * (t.customRate ?? 0)
  }, 0)
  const debtMap = new Map(debtsByTenant.map((d) => [d.tenantId, d._sum.amount ?? 0]))

  // ── Cashflow: 6 прошлых + 6 будущих месяцев ──
  const months: MonthData[] = []
  const now = new Date()
  for (let i = -5; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const isFuture = i > 0
    if (isFuture) {
      // Прогноз на основе текущей выручки и среднего расхода
      months.push({ period, income: monthlyRevenue, expense: monthlyRevenue * 0.3, forecast: true })
    } else {
      // Реальные данные за прошлые месяцы
      const start = new Date(d.getFullYear(), d.getMonth(), 1)
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      const [paymentsAgg, expensesAgg] = await Promise.all([
        db.payment.aggregate({
          where: {
            paymentDate: { gte: start, lt: end },
            tenant: { OR: [
              { space: { floorId: { in: floorIds } } },
              { fullFloors: { some: { id: { in: floorIds } } } },
            ] },
          },
          _sum: { amount: true },
        }),
        db.expense.aggregate({
          where: { date: { gte: start, lt: end }, buildingId },
          _sum: { amount: true },
        }),
      ])
      months.push({
        period,
        income: paymentsAgg._sum.amount ?? 0,
        expense: expensesAgg._sum.amount ?? 0,
      })
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Дашборд</h1>
        <p className="text-sm text-slate-500 mt-0.5">Обзор состояния здания</p>
      </div>

      {/* Cashflow chart */}
      <CashflowChart months={months} />

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
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-slate-400" />
              Активные заявки
            </h2>
            <Link href="/admin/requests" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
              Все <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {recentRequests.length === 0 ? (
            <p className="text-sm text-slate-400">Нет активных заявок</p>
          ) : (
            <ul className="space-y-2">
              {recentRequests.map((r) => (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 truncate">{r.title}</span>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-slate-400" />
              Задачи
            </h2>
            <Link href="/admin/tasks" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
              Все <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {recentTasks.length === 0 ? (
            <p className="text-sm text-slate-400">Нет активных задач</p>
          ) : (
            <ul className="space-y-2">
              {recentTasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-700 truncate">{t.title}</span>
                  <StatusBadge status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Арендаторы</h2>
          <Link href="/admin/tenants" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
            Все <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Компания</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500">Помещение</th>
              <th className="px-5 py-3 text-right text-xs font-medium text-slate-500">Долг</th>
            </tr>
          </thead>
          <tbody>
            {topTenants.map((t) => {
              const debt = debtMap.get(t.id) ?? 0
              return (
                <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-900">{t.companyName}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {t.space ? `Каб. ${t.space.number}` : "—"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {debt > 0 ? (
                      <span className="text-red-600 font-medium">{formatMoney(debt)}</span>
                    ) : (
                      <span className="text-emerald-600">Нет долга</span>
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
    blue: "bg-blue-50 text-blue-600",
    teal: "bg-teal-50 text-teal-600",
    green: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${colors[color]} mb-3`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      <p className="text-xs text-slate-400 mt-1">{sub}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    NEW: "bg-blue-100 text-blue-700",
    IN_PROGRESS: "bg-amber-100 text-amber-700",
    DONE: "bg-emerald-100 text-emerald-700",
  }
  const label: Record<string, string> = {
    NEW: "Новая",
    IN_PROGRESS: "В работе",
    DONE: "Готово",
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? "bg-slate-100 text-slate-500"}`}>
      {label[status] ?? status}
    </span>
  )
}
