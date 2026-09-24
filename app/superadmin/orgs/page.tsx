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
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { APPROVAL_PENDING, APPROVAL_REJECTED } from "@/lib/approval"
import { RegistrationApprovalButtons } from "./registration-approval-buttons"
import { getLocale, getT } from "@/lib/i18n/server"
import { INTL_LOCALE, type Locale } from "@/lib/i18n/config"
import type { Messages } from "@/lib/i18n/messages"
import type { Translator } from "@/lib/i18n/translate"

type T = Translator<Messages>["t"]

const PAGE_SIZE = 30
type StatusFilter = "all" | "pending" | "active" | "expiring" | "suspended" | "inactive" | "rejected"
type OrgListItem = {
  id: string
  name: string
  slug: string
  isActive: boolean
  isSuspended: boolean
  approvalStatus: string
  rejectionReason: string | null
  approvalRequestedAtLabel: string | null
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
  const locale = await getLocale()
  const { t } = await getT(locale)
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
        ? { isActive: true, isSuspended: false, approvalStatus: "APPROVED", OR: [{ planExpiresAt: null }, { planExpiresAt: { gte: now } }] }
        : status === "pending"
          ? { approvalStatus: APPROVAL_PENDING }
          : status === "rejected"
            ? { approvalStatus: APPROVAL_REJECTED }
        : status === "expiring"
          ? { isActive: true, isSuspended: false, approvalStatus: "APPROVED", planExpiresAt: { lte: sevenDays } }
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
          approvalStatus: true, approvalRequestedAt: true, rejectionReason: true,
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
      safe("superadmin.orgs.stats.active", db.organization.count({ where: { isActive: true, isSuspended: false, approvalStatus: "APPROVED" } }), 0),
      safe("superadmin.orgs.stats.pending", db.organization.count({ where: { approvalStatus: APPROVAL_PENDING } }), 0),
      safe("superadmin.orgs.stats.suspended", db.organization.count({ where: { isSuspended: true } }), 0),
      safe(
        "superadmin.orgs.stats.expiringSoon",
        db.organization.count({
          where: {
            isActive: true,
            isSuspended: false,
            approvalStatus: "APPROVED",
            planExpiresAt: { gte: now, lte: sevenDays },
          },
        }),
        0,
      ),
    ]).then(([all, active, pending, suspended, expiringSoon]) => ({
      total: all,
      active,
      pending,
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
      approvalStatus: o.approvalStatus,
      rejectionReason: o.rejectionReason,
      approvalRequestedAtLabel: o.approvalRequestedAt ? formatOrgDate(locale, o.approvalRequestedAt) : null,
      hasOwner: !!o.ownerUserId,
      planName: o.plan?.name ?? null,
      planExpiresAt: o.planExpiresAt ? o.planExpiresAt.toISOString() : null,
      planExpiresAtLabel: o.planExpiresAt ? formatOrgDate(locale, o.planExpiresAt) : null,
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
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t("superadmin.orgs.title")}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t("superadmin.orgs.subtitle", { total: stats.total, shown: items.length, found: total })}
          </p>
        </div>
        <Link
          href="/superadmin/orgs/new"
          className="flex items-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-700 px-4 py-2 text-sm font-medium text-white shadow-sm"
        >
          <Plus className="h-4 w-4" />
          {t("superadmin.orgs.create")}
        </Link>
      </div>

      <Card className="block p-3">
        <form className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <input type="hidden" name="status" value={status === "all" ? "" : status} />
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <Input
              name="q"
              defaultValue={query}
              placeholder={t("superadmin.orgs.searchPlaceholder")}
              className="pl-9"
            />
          </div>
          <Button>
            {t("common.actions.search")}
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[
            ["all", t("superadmin.orgs.filters.all"), stats.total],
            ["pending", t("superadmin.orgs.filters.pending"), stats.pending],
            ["active", t("superadmin.orgs.filters.active"), stats.active],
            ["expiring", t("superadmin.orgs.filters.expiring"), stats.expiringSoon],
            ["suspended", t("superadmin.orgs.filters.suspended"), stats.suspended],
            ["inactive", t("superadmin.orgs.filters.inactive"), null],
            ["rejected", t("superadmin.orgs.filters.rejected"), null],
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
      </Card>

      {/* KPI mini-cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard label={t("superadmin.orgs.kpi.total")} value={stats.total} icon={Building2} color="slate" />
        <KpiCard label={t("superadmin.orgs.kpi.pending")} value={stats.pending} icon={Clock} color="amber" />
        <KpiCard label={t("superadmin.orgs.kpi.active")} value={stats.active} icon={CheckCircle2} color="emerald" />
        <KpiCard label={t("superadmin.orgs.kpi.expiring")} value={stats.expiringSoon} icon={Clock} color="amber" />
        <KpiCard label={t("superadmin.orgs.kpi.suspended")} value={stats.suspended} icon={Pause} color="red" />
      </div>

      {items.length === 0 ? (
        <Card className="block rounded-2xl p-12 text-center">
          <Building2 className="h-12 w-12 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("superadmin.orgs.emptyTitle")}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t("superadmin.orgs.emptyHint")}</p>
        </Card>
      ) : (
        <Card className="block p-0">
          <OrgsTable items={items} rootHost={ROOT_HOST} t={t} />
          <PaginationControls
            basePath="/superadmin/orgs"
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            params={{ q: query, status: status === "all" ? null : status }}
          />
        </Card>
      )}
    </div>
  )
}

function OrgsTable({ items, rootHost, t }: { items: OrgListItem[]; rootHost: string; t: T }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
          <TableHead>{t("superadmin.cols.org")}</TableHead>
          <TableHead>{t("superadmin.cols.plan")}</TableHead>
          <TableHead>{t("superadmin.orgs.colSubscription")}</TableHead>
          <TableHead align="right">{t("superadmin.cols.buildings")}</TableHead>
          <TableHead align="right">{t("superadmin.cols.users")}</TableHead>
          <TableHead>{t("superadmin.cols.status")}</TableHead>
          <TableHead align="right">{t("superadmin.cols.actions")}</TableHead>
        </tr>
      </thead>
      <tbody>
        {items.map((org) => (
          <OrgRow key={org.id} org={org} rootHost={rootHost} t={t} />
        ))}
      </tbody>
    </table>
  )
}

function OrgRow({ org, rootHost, t }: { org: OrgListItem; rootHost: string; t: T }) {
  const orgUrl = `https://${org.slug}.${rootHost}`
  const isPendingApproval = org.approvalStatus === APPROVAL_PENDING

  return (
    <tr
      className={cn(
        "border-b border-slate-50 transition hover:bg-slate-50 dark:bg-slate-800/50 dark:hover:bg-slate-800/50",
        isPendingApproval && "bg-amber-50 dark:bg-amber-500/10",
        org.isSuspended && "bg-red-50 dark:bg-red-500/10",
        !org.isActive && "opacity-60",
      )}
    >
      <td className="px-5 py-3.5">
        <div className="min-w-0">
          <Link href={`/superadmin/orgs/${org.id}`} className="block">
            <span className="block font-medium text-slate-900 transition hover:text-purple-600 dark:text-slate-100 dark:hover:text-purple-400">
              {org.name}
            </span>
          </Link>
          <a
            href={orgUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 inline-flex items-center gap-0.5 font-mono text-[10px] text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
            title={t("superadmin.orgs.openSubdomain")}
          >
            {org.slug}.{rootHost}
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
          {isPendingApproval && (
            <p className="mt-1 text-[10px] font-medium text-amber-600 dark:text-amber-300">
              {t("superadmin.orgs.requestFrom", { date: org.approvalRequestedAtLabel ?? t("superadmin.orgs.requestToday") })}
            </p>
          )}
          {org.approvalStatus === APPROVAL_REJECTED && org.rejectionReason && (
            <p className="mt-1 max-w-64 truncate text-[10px] text-red-500" title={org.rejectionReason}>
              {org.rejectionReason}
            </p>
          )}
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
              suppressHydrationWarning
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
              <p suppressHydrationWarning className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                {org.expired
                  ? t("superadmin.orgs.overdueDays", { count: -org.daysLeft })
                  : t("superadmin.orgs.daysLeftShort", { count: org.daysLeft })}
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
        {isPendingApproval ? (
          <Badge color="amber">{t("superadmin.orgs.badge.pending")}</Badge>
        ) : org.approvalStatus === APPROVAL_REJECTED ? (
          <Badge color="red">{t("superadmin.orgs.badge.rejected")}</Badge>
        ) : org.isSuspended ? (
          <Badge color="red" icon={AlertTriangle}>{t("superadmin.orgs.badge.suspended")}</Badge>
        ) : !org.isActive ? (
          <Badge color="slate" icon={Pause}>{t("superadmin.orgs.badge.inactive")}</Badge>
        ) : org.expired ? (
          <Badge color="red">{t("superadmin.orgs.badge.expired")}</Badge>
        ) : org.expiringSoon ? (
          <Badge color="amber">{t("superadmin.orgs.badge.expiring")}</Badge>
        ) : (
          <Badge color="emerald">{t("superadmin.orgs.badge.active")}</Badge>
        )}
      </td>
      <td className="px-5 py-3.5">
        {isPendingApproval ? (
          <RegistrationApprovalButtons orgId={org.id} orgName={org.name} />
        ) : (
          <OrgRowActions
            id={org.id}
            name={org.name}
            hasOwner={org.hasOwner}
            isActive={org.isActive}
          />
        )}
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
  return value === "pending" || value === "active" || value === "expiring" || value === "suspended" || value === "inactive" || value === "rejected"
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

// Часовой пояс фиксируем: дата подписки должна читаться по Казахстану,
// а не по часовому поясу сервера.
function formatOrgDate(locale: Locale, value: Date): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { timeZone: "Asia/Qyzylorda" }).format(value)
}

function KpiCard({ label, value, icon: Icon, color }: {
  label: string
  value: number
  icon: React.ElementType
  color: "slate" | "emerald" | "amber" | "red"
}) {
  const colors = {
    slate: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
    emerald: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400",
    red: "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400",
  }
  return (
    <Card className="block p-4">
      <div className="flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
        </div>
      </div>
    </Card>
  )
}
