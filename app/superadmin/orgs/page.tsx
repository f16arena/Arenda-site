export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import Link from "next/link"
import { Plus, Building2, CheckCircle2, Clock, Pause } from "lucide-react"
import { OrgsListClient } from "./list-client"
import { ROOT_HOST } from "@/lib/host"

export default async function OrgsListPage() {
  await requirePlatformOwner()

  const orgs = await db.organization.findMany({
    select: {
      id: true, name: true, slug: true, isActive: true, isSuspended: true,
      planExpiresAt: true, createdAt: true, ownerUserId: true,
      plan: { select: { name: true, code: true, priceMonthly: true } },
      _count: { select: { buildings: true, users: true } },
    },
    orderBy: { createdAt: "desc" },
  }).catch(() => [])

  const now = new Date()
  const sevenDays = new Date(now.getTime() + 7 * 86_400_000)
  const stats = {
    total: orgs.length,
    active: orgs.filter((o) => o.isActive && !o.isSuspended).length,
    suspended: orgs.filter((o) => o.isSuspended).length,
    expiringSoon: orgs.filter((o) =>
      o.isActive && !o.isSuspended && o.planExpiresAt && o.planExpiresAt > now && o.planExpiresAt < sevenDays
    ).length,
  }

  const items = orgs.map((o) => {
    const expired = !!(o.planExpiresAt && o.planExpiresAt < now)
    const expiringSoon = !!(o.planExpiresAt && !expired && o.planExpiresAt < sevenDays)
    const daysLeft = o.planExpiresAt
      ? Math.ceil((o.planExpiresAt.getTime() - now.getTime()) / 86_400_000)
      : null
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      isActive: o.isActive,
      isSuspended: o.isSuspended,
      hasOwner: !!o.ownerUserId,
      planName: o.plan?.name ?? null,
      planExpiresAt: o.planExpiresAt ? o.planExpiresAt.toISOString() : null,
      expired,
      expiringSoon,
      daysLeft,
      buildingsCount: o._count.buildings,
      usersCount: o._count.users,
    }
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Организации</h1>
          <p className="text-sm text-slate-500 mt-0.5">{stats.total} клиентов на платформе</p>
        </div>
        <Link
          href="/superadmin/orgs/new"
          className="flex items-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-700 px-4 py-2 text-sm font-medium text-white shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Создать организацию
        </Link>
      </div>

      {/* KPI mini-cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Всего" value={stats.total} icon={Building2} color="slate" />
        <KpiCard label="Активных" value={stats.active} icon={CheckCircle2} color="emerald" />
        <KpiCard label="Истекают за 7 дн." value={stats.expiringSoon} icon={Clock} color="amber" />
        <KpiCard label="Приостановлено" value={stats.suspended} icon={Pause} color="red" />
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <Building2 className="h-12 w-12 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700">Пока нет организаций</p>
          <p className="text-xs text-slate-500 mt-1">Создайте первую через кнопку выше</p>
        </div>
      ) : (
        <OrgsListClient items={items} rootHost={ROOT_HOST} />
      )}
    </div>
  )
}

function KpiCard({ label, value, icon: Icon, color }: {
  label: string
  value: number
  icon: React.ElementType
  color: "slate" | "emerald" | "amber" | "red"
}) {
  const colors = {
    slate: "bg-slate-100 text-slate-600",
    emerald: "bg-emerald-100 text-emerald-600",
    amber: "bg-amber-100 text-amber-600",
    red: "bg-red-100 text-red-600",
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-xl font-bold text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  )
}

