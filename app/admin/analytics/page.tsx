export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { getCurrentBuildingId } from "@/lib/current-building"
import { formatMoney } from "@/lib/utils"
import { TrendingUp, Users, Building2, Award, Activity } from "lucide-react"
import { OccupancyHeatmap } from "./occupancy-heatmap"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingInOrg } from "@/lib/scope-guards"

export default async function AnalyticsPage() {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  const { orgId } = await requireOrgAccess()

  const buildingId = await getCurrentBuildingId()
  if (buildingId) await assertBuildingInOrg(buildingId, orgId)
  if (!buildingId) {
    return <div className="p-12 bg-white rounded-xl border border-slate-200 text-center text-slate-500">Выберите здание</div>
  }

  const floorIds = (await db.floor.findMany({ where: { buildingId }, select: { id: true } })).map((f) => f.id)
  const tenantWhere = { space: { floorId: { in: floorIds } } }

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
    db.space.groupBy({
      by: ["status"],
      where: { floorId: { in: floorIds } },
      _count: { _all: true },
    }).catch(() => []),
    db.tenant.count({
      where: { ...tenantWhere, spaceId: { not: null } },
    }).catch(() => 0),
    db.tenant.findMany({
      where: tenantWhere,
      select: { contractStart: true, contractEnd: true },
    }).catch(() => []),
    db.payment.aggregate({
      where: { paymentDate: { gte: yearStart }, tenant: tenantWhere },
      _sum: { amount: true },
    }).catch(() => ({ _sum: { amount: 0 } })),
    db.expense.aggregate({
      where: { date: { gte: yearStart }, buildingId },
      _sum: { amount: true },
    }).catch(() => ({ _sum: { amount: 0 } })),
    db.payment.groupBy({
      by: ["tenantId"],
      where: { paymentDate: { gte: yearStart }, tenant: tenantWhere },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 5,
    }).catch(() => []),
    db.tenant.findMany({
      where: tenantWhere,
      select: {
        space: { select: { id: true, number: true, area: true } },
        contractStart: true,
        contractEnd: true,
      },
    }).catch(() => []),
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
  const topPayerInfo = await db.tenant.findMany({
    where: { id: { in: topPayerIds } },
    select: { id: true, companyName: true },
  }).catch(() => [])
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

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
          <Activity className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Аналитика</h1>
          <p className="text-sm text-slate-500 mt-0.5">Ключевые показатели за {thisYear} год</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Заполняемость" value={`${occupancyRate}%`} icon={Building2} sub={`${occupied} из ${totalSpaces} помещений`} color="blue" />
        <Kpi label="Доход за год" value={formatMoney(totalRevenue)} icon={TrendingUp} sub={`${activeTenantsCount} арендаторов`} color="emerald" />
        <Kpi label="Прибыль" value={formatMoney(profit)} icon={Award} sub={`Маржа ${margin}%`} color={profit >= 0 ? "emerald" : "red"} />
        <Kpi label="Средний срок" value={`${avgMonths} мес.`} icon={Users} sub="по подписанным договорам" color="purple" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Топ-5 арендаторов по выручке за {thisYear}</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-5 py-2 text-left text-xs font-medium text-slate-500">№</th>
              <th className="px-5 py-2 text-left text-xs font-medium text-slate-500">Арендатор</th>
              <th className="px-5 py-2 text-right text-xs font-medium text-slate-500">Сумма</th>
              <th className="px-5 py-2 text-right text-xs font-medium text-slate-500">% от общей</th>
            </tr>
          </thead>
          <tbody>
            {topPayers.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-400">Нет платежей за этот год</td></tr>
            ) : topPayers.map((t, i) => {
              const amount = t._sum.amount ?? 0
              const percent = totalRevenue > 0 ? Math.round((amount / totalRevenue) * 100) : 0
              return (
                <tr key={t.tenantId} className="border-b border-slate-50">
                  <td className="px-5 py-2.5 text-slate-400">#{i + 1}</td>
                  <td className="px-5 py-2.5 font-medium text-slate-900">{t.companyName}</td>
                  <td className="px-5 py-2.5 text-right font-semibold text-emerald-600">{formatMoney(amount)}</td>
                  <td className="px-5 py-2.5 text-right text-slate-500">{percent}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <OccupancyHeatmap data={occupancyData} />
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
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
    purple: "bg-purple-50 text-purple-600",
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
