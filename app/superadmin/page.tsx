export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import { Building2, Users, Package, TrendingUp, AlertTriangle } from "lucide-react"

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

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Package className="h-4 w-4 text-slate-400" />
            Распределение по тарифам
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-5 py-2 text-left text-xs font-medium text-slate-500">Тариф</th>
              <th className="px-5 py-2 text-left text-xs font-medium text-slate-500">Цена/мес</th>
              <th className="px-5 py-2 text-right text-xs font-medium text-slate-500">Организаций</th>
              <th className="px-5 py-2 text-right text-xs font-medium text-slate-500">MRR</th>
            </tr>
          </thead>
          <tbody>
            {plansData.map((p) => (
              <tr key={p.id} className="border-b border-slate-50">
                <td className="px-5 py-2.5 font-medium text-slate-900">{p.name} <span className="text-xs text-slate-400">({p.code})</span></td>
                <td className="px-5 py-2.5 text-slate-600">{p.priceMonthly.toLocaleString("ru-RU")} ₸</td>
                <td className="px-5 py-2.5 text-right text-slate-600">{p._count.organizations}</td>
                <td className="px-5 py-2.5 text-right font-medium text-emerald-600">
                  {(p.priceMonthly * p._count.organizations).toLocaleString("ru-RU")} ₸
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
