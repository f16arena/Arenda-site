export const dynamic = "force-dynamic"

import Link from "next/link"
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CheckCircle,
  Clock,
  ExternalLink,
  TrendingUp,
  Users,
} from "lucide-react"
import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import { ROOT_HOST } from "@/lib/host"
import { safeServerValue } from "@/lib/server-fallback"

export default async function SubscriptionsTimelinePage() {
  const { userId } = await requirePlatformOwner()

  const now = new Date()
  const in7Days = new Date(now.getTime() + 7 * 24 * 3600 * 1000)
  const in30Days = new Date(now.getTime() + 30 * 24 * 3600 * 1000)

  const orgs = await safeServerValue(
    db.organization.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        isSuspended: true,
        planExpiresAt: true,
        plan: { select: { id: true, code: true, name: true, priceMonthly: true } },
        _count: { select: { buildings: true, users: true } },
      },
      orderBy: [{ planExpiresAt: "asc" }, { createdAt: "desc" }],
    }),
    [],
    { source: "superadmin.subscriptions.organizations", route: "/superadmin/subscriptions", userId },
  )

  const expired = orgs.filter((org) => org.planExpiresAt && org.planExpiresAt < now)
  const expiring7 = orgs.filter((org) => org.planExpiresAt && org.planExpiresAt >= now && org.planExpiresAt <= in7Days)
  const expiring30 = orgs.filter((org) => org.planExpiresAt && org.planExpiresAt > in7Days && org.planExpiresAt <= in30Days)
  const ok = orgs.filter((org) => org.planExpiresAt && org.planExpiresAt > in30Days)
  const noExpiry = orgs.filter((org) => !org.planExpiresAt)

  const activePaid = orgs.filter((org) => !org.isSuspended && (!org.planExpiresAt || org.planExpiresAt >= now))
  const mrr = activePaid.reduce((sum, org) => sum + (org.plan?.priceMonthly ?? 0), 0)
  const expiredMrr = expired.reduce((sum, org) => sum + (org.plan?.priceMonthly ?? 0), 0)
  const expiring7Mrr = expiring7.reduce((sum, org) => sum + (org.plan?.priceMonthly ?? 0), 0)

  const planRows = Object.values(orgs.reduce<Record<string, {
    key: string
    name: string
    clients: number
    mrr: number
    buildings: number
    users: number
  }>>((acc, org) => {
    const key = org.plan?.id ?? "none"
    if (!acc[key]) {
      acc[key] = {
        key,
        name: org.plan?.name ?? "Без тарифа",
        clients: 0,
        mrr: 0,
        buildings: 0,
        users: 0,
      }
    }
    acc[key].clients += 1
    acc[key].mrr += org.plan?.priceMonthly ?? 0
    acc[key].buildings += org._count.buildings
    acc[key].users += org._count.users
    return acc
  }, {})).sort((a, b) => b.mrr - a.mrr)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-100">
            <CalendarIcon className="h-6 w-6 text-slate-500" />
            Подписки и выручка
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Контроль тарифов, MRR, риска продления и распределения клиентов.
          </p>
        </div>
        <Link
          href="/superadmin/plans"
          className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
        >
          Конструктор тарифов
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="MRR" value={`${mrr.toLocaleString("ru-RU")} ₸`} icon={TrendingUp} tone="emerald" />
        <StatCard label="ARR" value={`${(mrr * 12).toLocaleString("ru-RU")} ₸`} icon={TrendingUp} tone="blue" />
        <StatCard label="Истекшая выручка" value={`${expiredMrr.toLocaleString("ru-RU")} ₸`} icon={AlertTriangle} tone="red" urgent={expiredMrr > 0} />
        <StatCard label="Риск 7 дней" value={`${expiring7Mrr.toLocaleString("ru-RU")} ₸`} icon={Clock} tone="amber" urgent={expiring7Mrr > 0} />
        <StatCard label="Активные клиенты" value={String(activePaid.length)} icon={Users} tone="slate" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Истекли" value={String(expired.length)} icon={AlertTriangle} tone="red" urgent={expired.length > 0} />
          <StatCard label="До 7 дней" value={String(expiring7.length)} icon={AlertTriangle} tone="amber" urgent={expiring7.length > 0} />
          <StatCard label="До 30 дней" value={String(expiring30.length)} icon={Clock} tone="blue" />
          <StatCard label="В порядке" value={String(ok.length)} icon={CheckCircle} tone="emerald" />
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-100">Тарифы по выручке</h2>
          </div>
          <div className="divide-y divide-slate-800">
            {planRows.map((plan) => (
              <div key={plan.key} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-100">{plan.name}</p>
                  <p className="text-xs text-slate-500">{plan.clients} клиентов · {plan.buildings} зданий · {plan.users} пользователей</p>
                </div>
                <p className="text-sm font-semibold text-emerald-300">{plan.mrr.toLocaleString("ru-RU")} ₸</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Group title="Истекли" orgs={expired} accent="red" emptyText="Нет истекших подписок" />
      <Group title="Истекают в течение 7 дней" orgs={expiring7} accent="amber" emptyText="Все стабильно на ближайшую неделю" />
      <Group title="Истекают в течение 30 дней" orgs={expiring30} accent="blue" emptyText="" />
      <Group title="Активные подписки" orgs={ok} accent="emerald" emptyText="" />
      {noExpiry.length > 0 && (
        <Group title="Без даты окончания" orgs={noExpiry} accent="slate" emptyText="" />
      )}
    </div>
  )
}

type OrgRow = {
  id: string
  name: string
  slug: string
  isSuspended: boolean
  planExpiresAt: Date | null
  plan: { id: string; code: string; name: string; priceMonthly: number } | null
  _count: { buildings: number; users: number }
}

type Accent = "red" | "amber" | "blue" | "emerald" | "slate"

const ACCENT_STYLES: Record<Accent, { dot: string; titleText: string }> = {
  red: { dot: "bg-red-500", titleText: "text-red-400" },
  amber: { dot: "bg-amber-500", titleText: "text-amber-400" },
  blue: { dot: "bg-blue-500", titleText: "text-blue-400" },
  emerald: { dot: "bg-emerald-500", titleText: "text-emerald-400" },
  slate: { dot: "bg-slate-400", titleText: "text-slate-300" },
}

function Group({
  title,
  orgs,
  accent,
  emptyText,
}: {
  title: string
  orgs: OrgRow[]
  accent: Accent
  emptyText: string
}) {
  const style = ACCENT_STYLES[accent]

  if (orgs.length === 0) {
    if (!emptyText) return null
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm">
        <div className="mb-1 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${style.dot}`} />
          <p className={`font-semibold ${style.titleText}`}>{title}</p>
        </div>
        <p className="ml-4 text-xs text-slate-500">{emptyText}</p>
      </div>
    )
  }

  const now = new Date()
  const groupMrr = orgs.reduce((sum, org) => sum + (org.plan?.priceMonthly ?? 0), 0)

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
          <h2 className={`text-sm font-semibold ${style.titleText}`}>
            {title}
            <span className="ml-2 font-normal text-slate-500">· {orgs.length}</span>
          </h2>
        </div>
        <span className="text-sm font-semibold text-emerald-300">{groupMrr.toLocaleString("ru-RU")} ₸ MRR</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-800/50">
            <th className="px-5 py-2 text-left text-xs font-medium text-slate-500">Организация</th>
            <th className="px-5 py-2 text-left text-xs font-medium text-slate-500">Тариф</th>
            <th className="px-5 py-2 text-left text-xs font-medium text-slate-500">Истекает</th>
            <th className="px-5 py-2 text-right text-xs font-medium text-slate-500">MRR</th>
            <th className="px-5 py-2 text-right text-xs font-medium text-slate-500">Зданий</th>
            <th className="px-5 py-2 text-right text-xs font-medium text-slate-500">Юзеров</th>
            <th className="px-5 py-2" />
          </tr>
        </thead>
        <tbody>
          {orgs.map((org) => {
            const days = org.planExpiresAt
              ? Math.ceil((org.planExpiresAt.getTime() - now.getTime()) / 86_400_000)
              : null
            return (
              <tr key={org.id} className="border-b border-slate-800/70 transition hover:bg-slate-800/50">
                <td className="px-5 py-2.5">
                  <Link href={`/superadmin/orgs/${org.id}`} className="font-medium text-slate-100 hover:text-purple-300">
                    {org.name}
                  </Link>
                  <div>
                    <a
                      href={`https://${org.slug}.${ROOT_HOST}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 font-mono text-[10px] text-slate-500 hover:text-blue-300"
                    >
                      {org.slug}.{ROOT_HOST} <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                </td>
                <td className="px-5 py-2.5 text-slate-400">{org.plan?.name ?? "-"}</td>
                <td className="px-5 py-2.5">
                  {org.planExpiresAt ? (
                    <div>
                      <p className="text-slate-300">{org.planExpiresAt.toLocaleDateString("ru-RU")}</p>
                      {days !== null && (
                        <p className={`text-[11px] ${
                          days < 0 ? "font-medium text-red-400"
                            : days <= 7 ? "font-medium text-amber-400"
                              : "text-slate-500"
                        }`}>
                          {days < 0 ? `просрочено ${Math.abs(days)} дн.` : `через ${days} дн.`}
                        </p>
                      )}
                    </div>
                  ) : "-"}
                </td>
                <td className="px-5 py-2.5 text-right font-medium text-emerald-300">
                  {org.plan ? `${org.plan.priceMonthly.toLocaleString("ru-RU")} ₸` : "-"}
                </td>
                <td className="px-5 py-2.5 text-right text-slate-400">{org._count.buildings}</td>
                <td className="px-5 py-2.5 text-right text-slate-400">{org._count.users}</td>
                <td className="px-5 py-2.5 text-right">
                  {org.isSuspended && <span className="text-[10px] font-medium text-red-400">приостановлен</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  urgent,
}: {
  label: string
  value: string
  icon: React.ElementType
  tone: "red" | "amber" | "blue" | "emerald" | "slate"
  urgent?: boolean
}) {
  const tones = {
    red: "border-red-500/30 bg-red-500/10 text-red-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-300",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    slate: "border-slate-800 bg-slate-900 text-slate-300",
  }

  return (
    <div className={`rounded-xl border p-4 ${urgent ? tones[tone] : "border-slate-800 bg-slate-900"}`}>
      <div className="mb-1 flex items-start justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <Icon className={`h-4 w-4 ${urgent ? "" : "text-slate-500"}`} />
      </div>
      <p className="text-2xl font-bold text-slate-100">{value}</p>
    </div>
  )
}
