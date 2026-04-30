export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import Link from "next/link"
import {
  Calendar as CalendarIcon, AlertTriangle, CheckCircle,
  Clock, ExternalLink,
} from "lucide-react"
import { ROOT_HOST } from "@/lib/host"

export default async function SubscriptionsTimelinePage() {
  await requirePlatformOwner()

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 1)
  const in7Days = new Date(now.getTime() + 7 * 24 * 3600 * 1000)
  const in30Days = new Date(now.getTime() + 30 * 24 * 3600 * 1000)

  const orgs = await db.organization.findMany({
    where: { isActive: true },
    select: {
      id: true, name: true, slug: true, isSuspended: true,
      planExpiresAt: true,
      plan: { select: { name: true, priceMonthly: true } },
      _count: { select: { buildings: true, users: true } },
    },
    orderBy: { planExpiresAt: "asc" },
  }).catch(() => [])

  // Группируем
  const expired = orgs.filter((o) => o.planExpiresAt && o.planExpiresAt < now)
  const expiring7 = orgs.filter((o) => o.planExpiresAt && o.planExpiresAt >= now && o.planExpiresAt <= in7Days)
  const expiring30 = orgs.filter((o) => o.planExpiresAt && o.planExpiresAt > in7Days && o.planExpiresAt <= in30Days)
  const ok = orgs.filter((o) => o.planExpiresAt && o.planExpiresAt > in30Days)
  const noExpiry = orgs.filter((o) => !o.planExpiresAt)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <CalendarIcon className="h-6 w-6 text-slate-400 dark:text-slate-500" />
          Подписки организаций
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">
          Состояние тарифов всех {orgs.length} активных организаций
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Истекли"
          value={expired.length}
          icon={AlertTriangle}
          color="red"
          urgent={expired.length > 0}
        />
        <StatCard
          label="Истекают за 7 дней"
          value={expiring7.length}
          icon={AlertTriangle}
          color="amber"
          urgent={expiring7.length > 0}
        />
        <StatCard
          label="Истекают за 30 дней"
          value={expiring30.length}
          icon={Clock}
          color="blue"
        />
        <StatCard
          label="В порядке"
          value={ok.length}
          icon={CheckCircle}
          color="emerald"
        />
      </div>

      {/* Группы */}
      <Group title="🚨 Истекли" orgs={expired} colorClass="bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30" emptyText="Нет истёкших подписок" />
      <Group title="⚠️ Истекают в течение 7 дней" orgs={expiring7} colorClass="bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30" emptyText="Все стабильны на ближайшую неделю" />
      <Group title="📅 Истекают в течение 30 дней" orgs={expiring30} colorClass="bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30" emptyText="" />
      <Group title="✓ Активные подписки" orgs={ok} colorClass="bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30" emptyText="" />
      {noExpiry.length > 0 && (
        <Group title="❓ Без даты окончания" orgs={noExpiry} colorClass="bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800" emptyText="" />
      )}
    </div>
  )
}

interface OrgRow {
  id: string
  name: string
  slug: string
  isSuspended: boolean
  planExpiresAt: Date | null
  plan: { name: string; priceMonthly: number } | null
  _count: { buildings: number; users: number }
}

function Group({
  title, orgs, colorClass, emptyText,
}: {
  title: string
  orgs: OrgRow[]
  colorClass: string
  emptyText: string
}) {
  if (orgs.length === 0) {
    if (!emptyText) return null
    return (
      <div className={`rounded-xl border p-4 text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 ${colorClass}`}>
        <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">{title}</p>
        <p className="text-xs">{emptyText}</p>
      </div>
    )
  }

  const now = new Date()

  return (
    <div className={`rounded-xl border overflow-hidden ${colorClass}`}>
      <div className="px-5 py-3 border-b border-black/5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title} <span className="text-slate-500 dark:text-slate-400 dark:text-slate-500 font-normal">· {orgs.length}</span>
        </h2>
      </div>
      <div className="bg-white dark:bg-slate-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50/50">
              <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Организация</th>
              <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Тариф</th>
              <th className="px-5 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Истекает</th>
              <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">MRR</th>
              <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Зданий</th>
              <th className="px-5 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Юзеров</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => {
              const days = o.planExpiresAt
                ? Math.ceil((o.planExpiresAt.getTime() - now.getTime()) / 86_400_000)
                : null
              return (
                <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50/50 transition">
                  <td className="px-5 py-2.5">
                    <Link
                      href={`/superadmin/orgs/${o.id}`}
                      className="font-medium text-slate-900 dark:text-slate-100 hover:text-purple-600 dark:text-purple-400"
                    >
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
                  <td className="px-5 py-2.5 text-slate-600 dark:text-slate-400 dark:text-slate-500">{o.plan?.name ?? "—"}</td>
                  <td className="px-5 py-2.5">
                    {o.planExpiresAt ? (
                      <div>
                        <p className="text-slate-700 dark:text-slate-300">
                          {o.planExpiresAt.toLocaleDateString("ru-RU")}
                        </p>
                        {days !== null && (
                          <p className={`text-[11px] ${
                            days < 0 ? "text-red-600 dark:text-red-400 font-medium"
                              : days <= 7 ? "text-amber-600 dark:text-amber-400 font-medium"
                              : "text-slate-400 dark:text-slate-500"
                          }`}>
                            {days < 0 ? `просрочено ${Math.abs(days)} дн.` : `через ${days} дн.`}
                          </p>
                        )}
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-right font-medium text-emerald-600 dark:text-emerald-400">
                    {o.plan ? `${o.plan.priceMonthly.toLocaleString("ru-RU")} ₸` : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-right text-slate-600 dark:text-slate-400 dark:text-slate-500">{o._count.buildings}</td>
                  <td className="px-5 py-2.5 text-right text-slate-600 dark:text-slate-400 dark:text-slate-500">{o._count.users}</td>
                  <td className="px-5 py-2.5 text-right">
                    {o.isSuspended && (
                      <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">приостановлен</span>
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
  label, value, icon: Icon, color, urgent,
}: {
  label: string
  value: number
  icon: React.ElementType
  color: "red" | "amber" | "blue" | "emerald"
  urgent?: boolean
}) {
  const colors = {
    red: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30",
    amber: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/30",
    blue: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30",
    emerald: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30",
  }
  return (
    <div className={`bg-white dark:bg-slate-900 rounded-xl border p-4 ${urgent ? colors[color] : "border-slate-200 dark:border-slate-800"}`}>
      <div className="flex items-start justify-between mb-1">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">{label}</span>
        <Icon className={`h-4 w-4 ${urgent ? colors[color].split(" ")[1] : "text-slate-400 dark:text-slate-500"}`} />
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  )
}
