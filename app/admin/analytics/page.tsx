import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { formatMoney } from "@/lib/utils"
import { TrendingUp, TrendingDown, Users, Building2, AlertCircle, CheckCircle } from "lucide-react"

function BarChart({ data, maxVal, color }: { data: { label: string; value: number }[]; maxVal: number; color: string }) {
  return (
    <div className="flex items-end gap-2 h-32">
      {data.map((d) => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[9px] text-slate-400 font-medium">{d.value > 0 ? Math.round(d.value / 1000) + "к" : ""}</span>
          <div className="w-full flex flex-col justify-end" style={{ height: "96px" }}>
            <div
              className={`w-full rounded-t ${color} transition-all`}
              style={{ height: `${maxVal > 0 ? Math.max(2, (d.value / maxVal) * 96) : 2}px` }}
            />
          </div>
          <span className="text-[9px] text-slate-400">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

export default async function AnalyticsPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")

  const now = new Date()
  const currentPeriod = now.toISOString().slice(0, 7)

  const periods = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return d.toISOString().slice(0, 7)
  })

  const [allCharges, allExpenses, allTenants, allSpaces, allTasks] = await Promise.all([
    db.charge.findMany({ where: { period: { in: periods } } }),
    db.expense.findMany({ where: { period: { in: periods } } }),
    db.tenant.findMany({ include: { space: true, charges: { where: { isPaid: false } } } }),
    db.space.findMany(),
    db.task.findMany({ where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } } }),
  ])

  const monthlyRevenue = periods.map((p) => ({
    label: p.slice(5),
    value: allCharges.filter((c) => c.period === p && c.isPaid).reduce((s, c) => s + c.amount, 0),
  }))

  const monthlyExpenses = periods.map((p) => ({
    label: p.slice(5),
    value: allExpenses.filter((e) => e.period === p).reduce((s, e) => s + e.amount, 0),
  }))

  const curCharges = allCharges.filter((c) => c.period === currentPeriod)
  const curRevenue = curCharges.filter((c) => c.isPaid).reduce((s, c) => s + c.amount, 0)
  const curExpenses = allExpenses.filter((e) => e.period === currentPeriod).reduce((s, e) => s + e.amount, 0)
  const curProfit = curRevenue - curExpenses

  const prevPeriod = periods[4]
  const prevRevenue = allCharges.filter((c) => c.period === prevPeriod && c.isPaid).reduce((s, c) => s + c.amount, 0)
  const revChange = prevRevenue > 0 ? Math.round(((curRevenue - prevRevenue) / prevRevenue) * 100) : 0

  const totalSpaces = allSpaces.length
  const occupiedSpaces = allSpaces.filter((s) => s.status === "OCCUPIED").length
  const occupancy = totalSpaces > 0 ? Math.round((occupiedSpaces / totalSpaces) * 100) : 0

  const totalDebt = allTenants.reduce((s, t) => s + t.charges.reduce((cs, c) => cs + c.amount, 0), 0)
  const totalCharged = curCharges.reduce((s, c) => s + c.amount, 0)
  const collectionRate = totalCharged > 0 ? Math.round((curRevenue / totalCharged) * 100) : 0

  const debtors = allTenants
    .map((t) => ({ name: t.companyName, debt: t.charges.reduce((s, c) => s + c.amount, 0) }))
    .filter((t) => t.debt > 0)
    .sort((a, b) => b.debt - a.debt)

  const taskStats = {
    new: allTasks.filter((t) => t.status === "NEW").length,
    inProgress: allTasks.filter((t) => t.status === "IN_PROGRESS").length,
    done: allTasks.filter((t) => t.status === "DONE").length,
    totalCost: allTasks.filter((t) => t.actualCost).reduce((s, t) => s + (t.actualCost ?? 0), 0),
  }

  const revenueByType = Object.entries(
    curCharges.filter((c) => c.isPaid)
      .reduce((acc, c) => ({ ...acc, [c.type]: (acc[c.type] ?? 0) + c.amount }), {} as Record<string, number>)
  ).sort((a, b) => b[1] - a[1])

  const CHARGE_TYPE_LABELS: Record<string, string> = {
    RENT: "Аренда", ELECTRICITY: "Электричество", WATER: "Вода",
    HEATING: "Отопление", CLEANING: "Уборка", PENALTY: "Пени", OTHER: "Прочее",
  }

  const maxRevenue = Math.max(...monthlyRevenue.map((d) => d.value), 1)
  const maxBoth = Math.max(maxRevenue, ...monthlyExpenses.map((d) => d.value), 1)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Аналитика</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {new Date(now.getFullYear(), now.getMonth(), 1).toLocaleString("ru-RU", { month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Выручка (месяц)", value: formatMoney(curRevenue), sub: revChange !== 0 ? `${revChange > 0 ? "+" : ""}${revChange}% к прошлому` : "нет данных", Icon: TrendingUp, color: "text-emerald-600", iconBg: "bg-emerald-50" },
          { label: "Расходы (месяц)", value: formatMoney(curExpenses), sub: "операционные", Icon: TrendingDown, color: "text-orange-600", iconBg: "bg-orange-50" },
          { label: "Прибыль (месяц)", value: formatMoney(curProfit), sub: curProfit >= 0 ? "положительная" : "убыток", Icon: curProfit >= 0 ? TrendingUp : TrendingDown, color: curProfit >= 0 ? "text-blue-600" : "text-red-600", iconBg: "bg-blue-50" },
          { label: "Общий долг", value: formatMoney(totalDebt), sub: `${collectionRate}% сбора за месяц`, Icon: AlertCircle, color: "text-red-600", iconBg: "bg-red-50" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-slate-500">{kpi.label}</p>
              <div className={`h-8 w-8 rounded-lg ${kpi.iconBg} flex items-center justify-center`}>
                <kpi.Icon className={`h-4 w-4 ${kpi.color}`} />
              </div>
            </div>
            <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="text-xs text-slate-400 mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-slate-900">Выручка по месяцам</p>
            <span className="text-xs text-slate-400">последние 6 мес.</span>
          </div>
          <BarChart data={monthlyRevenue} maxVal={maxBoth} color="bg-blue-500" />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-slate-900">Расходы по месяцам</p>
            <span className="text-xs text-slate-400">последние 6 мес.</span>
          </div>
          <BarChart data={monthlyExpenses} maxVal={maxBoth} color="bg-orange-400" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-900">Заполняемость</p>
              <Building2 className="h-4 w-4 text-slate-400" />
            </div>
            <p className="text-3xl font-bold text-slate-900">{occupancy}%</p>
            <p className="text-xs text-slate-400 mt-1">{occupiedSpaces} из {totalSpaces} помещений</p>
            <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${occupancy}%` }} />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-900">Арендаторы</p>
              <Users className="h-4 w-4 text-slate-400" />
            </div>
            <p className="text-3xl font-bold text-slate-900">{allTenants.length}</p>
            <p className="text-xs text-slate-400 mt-1">{allTenants.filter((t) => t.space).length} с помещением</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm font-semibold text-slate-900 mb-3">Задачи</p>
            <div className="space-y-2">
              {[
                { label: "Новые", value: taskStats.new, color: "bg-blue-500" },
                { label: "В работе", value: taskStats.inProgress, color: "bg-amber-500" },
                { label: "Выполнены", value: taskStats.done, color: "bg-emerald-500" },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-2 text-xs">
                  <div className={`h-2 w-2 rounded-full ${s.color}`} />
                  <span className="text-slate-600 flex-1">{s.label}</span>
                  <span className="font-semibold text-slate-900">{s.value}</span>
                </div>
              ))}
              {taskStats.totalCost > 0 && (
                <p className="text-xs text-slate-400 pt-1 border-t border-slate-50">
                  Расходы на задачи: {formatMoney(taskStats.totalCost)}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-4">Структура доходов</p>
          {revenueByType.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Нет оплаченных начислений</p>
          ) : (
            <div className="space-y-3">
              {revenueByType.map(([type, amount]) => {
                const pct = curRevenue > 0 ? Math.round((amount / curRevenue) * 100) : 0
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-600">{CHARGE_TYPE_LABELS[type] ?? type}</span>
                      <span className="font-semibold text-slate-900">{formatMoney(amount)} · {pct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
              <div className="pt-3 border-t border-slate-100 space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Выручка</span>
                  <span className="font-semibold text-emerald-600">{formatMoney(curRevenue)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Расходы</span>
                  <span className="font-semibold text-orange-600">{formatMoney(curExpenses)}</span>
                </div>
                <div className="flex items-center justify-between text-sm font-bold pt-1 border-t border-slate-100">
                  <span>Прибыль</span>
                  <span className={curProfit >= 0 ? "text-emerald-700" : "text-red-600"}>{formatMoney(curProfit)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-slate-900">Должники</p>
            <span className="text-xs text-red-500 font-medium">{formatMoney(totalDebt)}</span>
          </div>
          {debtors.length === 0 ? (
            <div className="py-8 text-center">
              <CheckCircle className="h-8 w-8 text-emerald-300 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Долгов нет</p>
            </div>
          ) : (
            <div className="space-y-3">
              {debtors.map((d, i) => {
                const pct = totalDebt > 0 ? (d.debt / totalDebt) * 100 : 0
                return (
                  <div key={d.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-700 truncate flex-1 mr-2">
                        <span className="text-slate-400 mr-1">{i + 1}.</span>{d.name}
                      </span>
                      <span className="font-semibold text-red-600 shrink-0">{formatMoney(d.debt)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
