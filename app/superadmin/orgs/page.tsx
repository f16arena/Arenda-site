export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import Link from "next/link"
import { Plus, Building2, CheckCircle2, Clock, Pause, Search } from "lucide-react"
import { OrgsListClient } from "./list-client"
import { ROOT_HOST } from "@/lib/host"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { normalizePage, pageSkip } from "@/lib/pagination"
import type { Prisma } from "@/app/generated/prisma/client"

const PAGE_SIZE = 30
type StatusFilter = "all" | "active" | "expiring" | "suspended" | "inactive"

export default async function OrgsListPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[]; status?: string | string[]; page?: string | string[] }>
}) {
  await requirePlatformOwner()
  const resolved = await searchParams
  const query = one(resolved?.q).trim()
  const status = normalizeStatus(one(resolved?.status))
  const page = normalizePage(resolved?.page)

  const now = new Date()
  const sevenDays = new Date(now.getTime() + 7 * 86_400_000)
  const where: Prisma.OrganizationWhereInput = {
    AND: [
      query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { slug: { contains: query, mode: "insensitive" } },
            ],
          }
        : {},
      status === "active"
        ? { isActive: true, isSuspended: false, OR: [{ planExpiresAt: null }, { planExpiresAt: { gte: now } }] }
        : status === "expiring"
          ? { isActive: true, isSuspended: false, planExpiresAt: { lte: sevenDays } }
          : status === "suspended"
            ? { isSuspended: true }
            : status === "inactive"
              ? { isActive: false }
              : {},
    ],
  }

  const [orgs, total, stats] = await Promise.all([
    db.organization.findMany({
      where,
      select: {
        id: true, name: true, slug: true, isActive: true, isSuspended: true,
        planExpiresAt: true, createdAt: true, ownerUserId: true,
        plan: { select: { name: true, code: true, priceMonthly: true } },
        _count: { select: { buildings: true, users: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: pageSkip(page, PAGE_SIZE),
      take: PAGE_SIZE,
    }).catch(() => []),
    db.organization.count({ where }).catch(() => 0),
    Promise.all([
      db.organization.count().catch(() => 0),
      db.organization.count({ where: { isActive: true, isSuspended: false } }).catch(() => 0),
      db.organization.count({ where: { isSuspended: true } }).catch(() => 0),
      db.organization.count({
        where: {
          isActive: true,
          isSuspended: false,
          planExpiresAt: { gte: now, lte: sevenDays },
        },
      }).catch(() => 0),
    ]).then(([all, active, suspended, expiringSoon]) => ({
      total: all,
      active,
      suspended,
      expiringSoon,
    })),
  ])

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
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Организации</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">
            {stats.total} клиентов на платформе · показано {items.length} из {total}
          </p>
        </div>
        <Link
          href="/superadmin/orgs/new"
          className="flex items-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-700 px-4 py-2 text-sm font-medium text-white shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Создать организацию
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <form className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <input type="hidden" name="status" value={status === "all" ? "" : status} />
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              name="q"
              defaultValue={query}
              placeholder="Поиск по названию или slug..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-slate-800 dark:bg-slate-950"
            />
          </div>
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Найти
          </button>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[
            ["all", "Все", stats.total],
            ["active", "Активные", stats.active],
            ["expiring", "Истекают", stats.expiringSoon],
            ["suspended", "Приостановлено", stats.suspended],
            ["inactive", "Деактивировано", null],
          ].map(([value, label, count]) => {
            const filter = value as StatusFilter
            const active = status === filter
            return (
              <Link
                key={filter}
                href={hrefFor({ q: query, status: filter === "all" ? null : filter })}
                className={[
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  active
                    ? "bg-purple-600 text-white shadow-sm"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/50",
                ].join(" ")}
              >
                {label}
                {typeof count === "number" && (
                  <span className={active ? "ml-1.5 text-[10px] text-purple-100" : "ml-1.5 text-[10px] text-slate-400 dark:text-slate-500"}>
                    {count}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </div>

      {/* KPI mini-cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Всего" value={stats.total} icon={Building2} color="slate" />
        <KpiCard label="Активных" value={stats.active} icon={CheckCircle2} color="emerald" />
        <KpiCard label="Истекают за 7 дн." value={stats.expiringSoon} icon={Clock} color="amber" />
        <KpiCard label="Приостановлено" value={stats.suspended} icon={Pause} color="red" />
      </div>

      {items.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
          <Building2 className="h-12 w-12 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Пока нет организаций</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">Создайте первую через кнопку выше</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <OrgsListClient items={items} rootHost={ROOT_HOST} hideFilters />
          <PaginationControls
            basePath="/superadmin/orgs"
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            params={{ q: query, status: status === "all" ? null : status }}
          />
        </div>
      )}
    </div>
  )
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

function normalizeStatus(value: string): StatusFilter {
  return value === "active" || value === "expiring" || value === "suspended" || value === "inactive"
    ? value
    : "all"
}

function hrefFor(params: { q?: string | null; status?: string | null }) {
  const query = new URLSearchParams()
  if (params.q) query.set("q", params.q)
  if (params.status) query.set("status", params.status)
  const qs = query.toString()
  return qs ? `/superadmin/orgs?${qs}` : "/superadmin/orgs"
}

function KpiCard({ label, value, icon: Icon, color }: {
  label: string
  value: number
  icon: React.ElementType
  color: "slate" | "emerald" | "amber" | "red"
}) {
  const colors = {
    slate: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 dark:text-slate-500",
    emerald: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400",
    red: "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400",
  }
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-500">{label}</p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
        </div>
      </div>
    </div>
  )
}
