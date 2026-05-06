export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import Link from "next/link"
import { Plus, Building2, CheckCircle2, Clock, Pause, Search, ExternalLink, AlertTriangle } from "lucide-react"
import { ROOT_HOST } from "@/lib/host"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { normalizePage, pageSkip } from "@/lib/pagination"
import type { Prisma } from "@/app/generated/prisma/client"
import { safeServerValue } from "@/lib/server-fallback"
import { OrgRowActions } from "./row-actions"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 30
type StatusFilter = "all" | "active" | "expiring" | "suspended" | "inactive"
type OrgListItem = {
  id: string
  name: string
  slug: string
  isActive: boolean
  isSuspended: boolean
  hasOwner: boolean
  planName: string | null
  planExpiresAt: string | null
  planExpiresAtLabel: string | null
  expired: boolean
  expiringSoon: boolean
  daysLeft: number | null
  buildingsCount: number
  usersCount: number
}

export default async function OrgsListPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[]; status?: string | string[]; page?: string | string[] }>
}) {
  const { userId } = await requirePlatformOwner()
  const resolved = await searchParams
  const query = one(resolved?.q).trim()
  const status = normalizeStatus(one(resolved?.status))
  const page = normalizePage(resolved?.page)
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/superadmin/orgs", userId })

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
    safe(
      "superadmin.orgs.items",
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
      }),
      [],
    ),
    safe("superadmin.orgs.total", db.organization.count({ where }), 0),
    Promise.all([
      safe("superadmin.orgs.stats.total", db.organization.count(), 0),
      safe("superadmin.orgs.stats.active", db.organization.count({ where: { isActive: true, isSuspended: false } }), 0),
      safe("superadmin.orgs.stats.suspended", db.organization.count({ where: { isSuspended: true } }), 0),
      safe(
        "superadmin.orgs.stats.expiringSoon",
        db.organization.count({
          where: {
            isActive: true,
            isSuspended: false,
            planExpiresAt: { gte: now, lte: sevenDays },
          },
        }),
        0,
      ),
    ]).then(([all, active, suspended, expiringSoon]) => ({
      total: all,
      active,
      suspended,
      expiringSoon,
    })),
  ])

  const items: OrgListItem[] = orgs.map((o) => {
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
      planExpiresAtLabel: o.planExpiresAt ? formatDateRu(o.planExpiresAt) : null,
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
          <OrgsTable items={items} rootHost={ROOT_HOST} />
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

function OrgsTable({ items, rootHost }: { items: OrgListItem[]; rootHost: string }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
          <TableHead>Организация</TableHead>
          <TableHead>Тариф</TableHead>
          <TableHead>Подписка</TableHead>
          <TableHead align="right">Зданий</TableHead>
          <TableHead align="right">Пользователей</TableHead>
          <TableHead>Статус</TableHead>
          <TableHead align="right">Действия</TableHead>
        </tr>
      </thead>
      <tbody>
        {items.map((org) => (
          <OrgRow key={org.id} org={org} rootHost={rootHost} />
        ))}
      </tbody>
    </table>
  )
}

function OrgRow({ org, rootHost }: { org: OrgListItem; rootHost: string }) {
  const orgUrl = `https://${org.slug}.${rootHost}`

  return (
    <tr
      className={cn(
        "border-b border-slate-50 transition hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50",
        org.isSuspended && "bg-red-50 dark:bg-red-500/10",
        !org.isActive && "opacity-60",
      )}
    >
      <td className="px-5 py-3.5">
        <div className="min-w-0">
          <Link href={`/superadmin/orgs/${org.id}`} className="block">
            <p className="font-medium text-slate-900 transition hover:text-purple-600 dark:text-slate-100 dark:hover:text-purple-400">
              {org.name}
            </p>
          </Link>
          <a
            href={orgUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-0.5 font-mono text-[10px] text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
            title="Открыть поддомен в новой вкладке"
          >
            {org.slug}.{rootHost}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      </td>
      <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">
        {org.planName ? (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {org.planName}
          </span>
        ) : (
          <span className="text-slate-400 dark:text-slate-500">—</span>
        )}
      </td>
      <td className="px-5 py-3.5 text-xs">
        {org.planExpiresAt ? (
          <div>
            <p
              className={cn(
                org.expired
                  ? "font-medium text-red-600 dark:text-red-400"
                  : org.expiringSoon
                    ? "font-medium text-amber-600 dark:text-amber-400"
                    : "text-slate-600 dark:text-slate-400",
              )}
            >
              {org.planExpiresAtLabel ?? "—"}
            </p>
            {org.daysLeft !== null && (
              <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                {org.expired ? `просрочен ${-org.daysLeft} дн.` : `${org.daysLeft} дн.`}
              </p>
            )}
          </div>
        ) : (
          <span className="text-slate-400 dark:text-slate-500">—</span>
        )}
      </td>
      <td className="px-5 py-3.5 text-right text-slate-600 dark:text-slate-400">{org.buildingsCount}</td>
      <td className="px-5 py-3.5 text-right text-slate-600 dark:text-slate-400">{org.usersCount}</td>
      <td className="px-5 py-3.5">
        {org.isSuspended ? (
          <Badge color="red" icon={AlertTriangle}>Приостановлен</Badge>
        ) : !org.isActive ? (
          <Badge color="slate" icon={Pause}>Деактивирован</Badge>
        ) : org.expired ? (
          <Badge color="red">Истек</Badge>
        ) : org.expiringSoon ? (
          <Badge color="amber">Истекает</Badge>
        ) : (
          <Badge color="emerald">Активен</Badge>
        )}
      </td>
      <td className="px-5 py-3.5">
        <OrgRowActions
          id={org.id}
          name={org.name}
          hasOwner={org.hasOwner}
          isActive={org.isActive}
        />
      </td>
    </tr>
  )
}

function TableHead({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={cn(
        "px-5 py-3 text-xs font-medium text-slate-500 dark:text-slate-400",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  )
}

function Badge({
  children,
  color,
  icon: Icon,
}: {
  children: React.ReactNode
  color: "emerald" | "amber" | "red" | "slate"
  icon?: React.ElementType
}) {
  const colors = {
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
    red: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${colors[color]}`}>
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
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

function formatDateRu(value: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Qyzylorda" }).format(value)
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
