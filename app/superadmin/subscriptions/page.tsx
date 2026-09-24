export const dynamic = "force-dynamic"

import Link from "next/link"
import type { Prisma } from "@/app/generated/prisma/client"
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CheckCircle,
  Clock,
  ExternalLink,
  Search,
  TrendingUp,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { db } from "@/lib/db"
import { ROOT_HOST } from "@/lib/host"
import { normalizePage, pageSkip } from "@/lib/pagination"
import { requirePlatformOwner } from "@/lib/org"
import { safeServerValue } from "@/lib/server-fallback"
import { measureServerRoute, measureServerStep } from "@/lib/server-performance"
import { cn } from "@/lib/utils"
import { getLocale, getT } from "@/lib/i18n/server"
import { formatDateShortL, formatMoneyL } from "@/lib/i18n/format"
import type { Locale } from "@/lib/i18n/config"
import type { Messages } from "@/lib/i18n/messages"
import type { Translator } from "@/lib/i18n/translate"

type T = Translator<Messages>["t"]

const PAGE_SIZE = 30

// Значения фильтра уходят в адрес страницы — не переводятся; подписи берём
// из словаря по этому же коду.
const FILTERS = [
  { value: "all", labelKey: "superadmin.subs.filters.all" },
  { value: "expired", labelKey: "superadmin.subs.filters.expired" },
  { value: "expiring7", labelKey: "superadmin.subs.filters.expiring7" },
  { value: "expiring30", labelKey: "superadmin.subs.filters.expiring30" },
  { value: "ok", labelKey: "superadmin.subs.filters.ok" },
  { value: "noExpiry", labelKey: "superadmin.subs.filters.noExpiry" },
] as const

type SubscriptionFilter = (typeof FILTERS)[number]["value"]
type SearchParams = {
  page?: string | string[]
  q?: string | string[]
  status?: string | string[]
}
type PlanGroup = { planId: string | null; _count: { _all: number } }

export default async function SubscriptionsTimelinePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  return measureServerRoute("/superadmin/subscriptions", () => renderSubscriptionsTimelinePage({ searchParams }))
}

async function renderSubscriptionsTimelinePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { userId } = await requirePlatformOwner()
  const locale = await getLocale()
  const { t } = await getT(locale)
  const params = await searchParams
  const page = normalizePage(params.page)
  const query = one(params.q).trim()
  const filter = normalizeFilter(one(params.status))

  const now = new Date()
  const in7Days = new Date(now.getTime() + 7 * 24 * 3600 * 1000)
  const in30Days = new Date(now.getTime() + 30 * 24 * 3600 * 1000)

  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/superadmin/subscriptions", userId })

  const activeWhere: Prisma.OrganizationWhereInput = { isActive: true }
  const expiredWhere: Prisma.OrganizationWhereInput = { isActive: true, planExpiresAt: { lt: now } }
  const expiring7Where: Prisma.OrganizationWhereInput = {
    isActive: true,
    planExpiresAt: { gte: now, lte: in7Days },
  }
  const expiring30Where: Prisma.OrganizationWhereInput = {
    isActive: true,
    planExpiresAt: { gt: in7Days, lte: in30Days },
  }
  const okWhere: Prisma.OrganizationWhereInput = { isActive: true, planExpiresAt: { gt: in30Days } }
  const noExpiryWhere: Prisma.OrganizationWhereInput = { isActive: true, planExpiresAt: null }
  const activePaidWhere: Prisma.OrganizationWhereInput = {
    isActive: true,
    isSuspended: false,
    OR: [{ planExpiresAt: null }, { planExpiresAt: { gte: now } }],
  }

  const searchWhere: Prisma.OrganizationWhereInput = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { slug: { contains: query, mode: "insensitive" } },
        ],
      }
    : {}
  const listWhere: Prisma.OrganizationWhereInput = {
    AND: [statusWhere(filter, now, in7Days, in30Days), searchWhere],
  }

  const [
    orgs,
    total,
    totalActive,
    expiredCount,
    expiring7Count,
    expiring30Count,
    okCount,
    noExpiryCount,
    activePaidCount,
    allPlanGroups,
    activePlanGroups,
    expiredPlanGroups,
    expiring7PlanGroups,
  ] = await measureServerStep("/superadmin/subscriptions", "subscription-data", Promise.all([
    safe(
      "superadmin.subscriptions.organizations.page",
      db.organization.findMany({
        where: listWhere,
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
        skip: pageSkip(page, PAGE_SIZE),
        take: PAGE_SIZE,
      }),
      [],
    ),
    safe("superadmin.subscriptions.organizations.count", db.organization.count({ where: listWhere }), 0),
    safe("superadmin.subscriptions.stats.active", db.organization.count({ where: activeWhere }), 0),
    safe("superadmin.subscriptions.stats.expired", db.organization.count({ where: expiredWhere }), 0),
    safe("superadmin.subscriptions.stats.expiring7", db.organization.count({ where: expiring7Where }), 0),
    safe("superadmin.subscriptions.stats.expiring30", db.organization.count({ where: expiring30Where }), 0),
    safe("superadmin.subscriptions.stats.ok", db.organization.count({ where: okWhere }), 0),
    safe("superadmin.subscriptions.stats.noExpiry", db.organization.count({ where: noExpiryWhere }), 0),
    safe("superadmin.subscriptions.stats.activePaid", db.organization.count({ where: activePaidWhere }), 0),
    safe(
      "superadmin.subscriptions.planGroups.all",
      db.organization.groupBy({ by: ["planId"], where: activeWhere, _count: { _all: true } }),
      [],
    ),
    safe(
      "superadmin.subscriptions.planGroups.activePaid",
      db.organization.groupBy({ by: ["planId"], where: activePaidWhere, _count: { _all: true } }),
      [],
    ),
    safe(
      "superadmin.subscriptions.planGroups.expired",
      db.organization.groupBy({ by: ["planId"], where: expiredWhere, _count: { _all: true } }),
      [],
    ),
    safe(
      "superadmin.subscriptions.planGroups.expiring7",
      db.organization.groupBy({ by: ["planId"], where: expiring7Where, _count: { _all: true } }),
      [],
    ),
  ]))

  const planIds = uniquePlanIds(allPlanGroups, activePlanGroups, expiredPlanGroups, expiring7PlanGroups)
  const plans = await safe(
    "superadmin.subscriptions.plans",
    planIds.length
      ? db.plan.findMany({
          where: { id: { in: planIds } },
          select: { id: true, name: true, priceMonthly: true },
        })
      : Promise.resolve([]),
    [],
  )
  const planById = new Map(plans.map((plan) => [plan.id, plan]))
  const mrr = mrrFromGroups(activePlanGroups, planById)
  const expiredMrr = mrrFromGroups(expiredPlanGroups, planById)
  const expiring7Mrr = mrrFromGroups(expiring7PlanGroups, planById)
  const planRows = allPlanGroups
    .map((group) => {
      const plan = group.planId ? planById.get(group.planId) : null
      const priceMonthly = plan?.priceMonthly ?? 0
      return {
        key: group.planId ?? "none",
        name: plan?.name ?? t("superadmin.subs.noPlan"),
        clients: group._count._all,
        priceMonthly,
        mrr: priceMonthly * group._count._all,
      }
    })
    .sort((a, b) => b.mrr - a.mrr)

  const filterCounts: Record<SubscriptionFilter, number> = {
    all: totalActive,
    expired: expiredCount,
    expiring7: expiring7Count,
    expiring30: expiring30Count,
    ok: okCount,
    noExpiry: noExpiryCount,
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            <CalendarIcon className="h-6 w-6 text-slate-500" />
            {t("superadmin.subs.title")}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {t("superadmin.subs.subtitle", { size: PAGE_SIZE })}
          </p>
        </div>
        <Link
          href="/superadmin/plans"
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {t("superadmin.subs.plansLink")}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label={t("superadmin.subs.mrr")} value={formatMoneyL(locale, mrr)} icon={TrendingUp} tone="emerald" />
        <StatCard label={t("superadmin.subs.arr")} value={formatMoneyL(locale, mrr * 12)} icon={TrendingUp} tone="blue" />
        <StatCard label={t("superadmin.subs.expiredRevenue")} value={formatMoneyL(locale, expiredMrr)} icon={AlertTriangle} tone="red" urgent={expiredMrr > 0} />
        <StatCard label={t("superadmin.subs.risk7")} value={formatMoneyL(locale, expiring7Mrr)} icon={Clock} tone="amber" urgent={expiring7Mrr > 0} />
        <StatCard label={t("superadmin.subs.activeClients")} value={String(activePaidCount)} icon={Users} tone="slate" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label={t("superadmin.subs.expired")} value={String(expiredCount)} icon={AlertTriangle} tone="red" urgent={expiredCount > 0} />
            <StatCard label={t("superadmin.subs.upTo7")} value={String(expiring7Count)} icon={AlertTriangle} tone="amber" urgent={expiring7Count > 0} />
            <StatCard label={t("superadmin.subs.upTo30")} value={String(expiring30Count)} icon={Clock} tone="blue" />
            <StatCard label={t("superadmin.subs.ok")} value={String(okCount)} icon={CheckCircle} tone="emerald" />
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <form className="flex flex-col gap-3 sm:flex-row" action="/superadmin/subscriptions">
              {filter !== "all" && <input type="hidden" name="status" value={filter} />}
              <label className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  name="q"
                  defaultValue={query}
                  placeholder={t("superadmin.subs.searchPlaceholder")}
                  className="border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 pl-9 text-slate-900 dark:text-slate-100 placeholder:text-slate-600"
                />
              </label>
              <Button>
                {t("common.actions.search")}
              </Button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {FILTERS.map((item) => (
                <Link
                  key={item.value}
                  href={filterHref(item.value, query)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                    filter === item.value
                      ? "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-200"
                      : "border-slate-200 dark:border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-900 dark:hover:text-slate-200",
                  )}
                >
                  {t(item.labelKey)}
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] text-slate-700 dark:text-slate-300">
                    {filterCounts[item.value]}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="border-b border-slate-200 dark:border-slate-800 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("superadmin.subs.plansByRevenue")}</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {planRows.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">{t("superadmin.subs.noActiveOrgs")}</p>
            ) : (
              planRows.map((plan) => (
                <div key={plan.key} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{plan.name}</p>
                    <p className="text-xs text-slate-500">
                      {t("superadmin.subs.planRow", {
                        clients: plan.clients,
                        price: `${formatMoneyL(locale, plan.priceMonthly)}${t("common.money.perMonth")}`,
                      })}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{formatMoneyL(locale, plan.mrr)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <Group
          title={t(filterTitleKey(filter))}
          orgs={orgs}
          accent={filterAccent(filter)}
          emptyText={query ? t("superadmin.subs.emptySearch") : t("superadmin.subs.emptySlice")}
          locale={locale}
          t={t}
        />
        <PaginationControls
          basePath="/superadmin/subscriptions"
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          params={{ q: query, status: filter }}
        />
      </div>
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
  slate: { dot: "bg-slate-400", titleText: "text-slate-700 dark:text-slate-300" },
}

function Group({
  title,
  orgs,
  accent,
  emptyText,
  locale,
  t,
}: {
  title: string
  orgs: OrgRow[]
  accent: Accent
  emptyText: string
  locale: Locale
  t: T
}) {
  const style = ACCENT_STYLES[accent]

  if (orgs.length === 0) {
    return (
      <div className="p-4 text-sm">
        <div className="mb-1 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${style.dot}`} />
          <p className={`font-semibold ${style.titleText}`}>{title}</p>
        </div>
        <p className="ml-4 text-xs text-slate-500">{emptyText}</p>
      </div>
    )
  }

  const now = new Date()
  const pageMrr = orgs.reduce((sum, org) => sum + (org.plan?.priceMonthly ?? 0), 0)

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-5 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`} />
          <h2 className={`text-sm font-semibold ${style.titleText}`}>
            {title}
            <span className="ml-2 font-normal text-slate-500">{t("superadmin.subs.onPage", { count: orgs.length })}</span>
          </h2>
        </div>
        <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{t("superadmin.subs.pageMrr", { amount: formatMoneyL(locale, pageMrr) })}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/50">
              <th className="px-5 py-2 text-left text-xs font-medium text-slate-500">{t("superadmin.cols.org")}</th>
              <th className="px-5 py-2 text-left text-xs font-medium text-slate-500">{t("superadmin.cols.plan")}</th>
              <th className="px-5 py-2 text-left text-xs font-medium text-slate-500">{t("superadmin.cols.expires")}</th>
              <th className="px-5 py-2 text-right text-xs font-medium text-slate-500">{t("superadmin.cols.mrr")}</th>
              <th className="px-5 py-2 text-right text-xs font-medium text-slate-500">{t("superadmin.cols.buildings")}</th>
              <th className="px-5 py-2 text-right text-xs font-medium text-slate-500">{t("superadmin.cols.users")}</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody>
            {orgs.map((org) => {
              const days = org.planExpiresAt
                ? Math.ceil((org.planExpiresAt.getTime() - now.getTime()) / 86_400_000)
                : null
              return (
                <tr key={org.id} className="border-b border-slate-800/70 transition last:border-b-0 hover:bg-slate-800/50">
                  <td className="px-5 py-2.5">
                    <Link href={`/superadmin/orgs/${org.id}`} className="font-medium text-slate-900 dark:text-slate-100 hover:text-purple-700 dark:hover:text-purple-300">
                      {org.name}
                    </Link>
                    <div>
                      <a
                        href={`https://${org.slug}.${ROOT_HOST}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 font-mono text-[10px] text-slate-500 hover:text-blue-700 dark:hover:text-blue-300"
                      >
                        {org.slug}.{ROOT_HOST} <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                  </td>
                  <td className="px-5 py-2.5 text-slate-400">{org.plan?.name ?? "-"}</td>
                  <td className="px-5 py-2.5">
                    {org.planExpiresAt ? (
                      <div>
                        <p className="text-slate-700 dark:text-slate-300">{formatDateShortL(locale, org.planExpiresAt)}</p>
                        {days !== null && (
                          <p className={cn(
                            "text-[11px]",
                            days < 0
                              ? "font-medium text-red-400"
                              : days <= 7
                                ? "font-medium text-amber-400"
                                : "text-slate-500",
                          )}>
                            {days < 0
                              ? t("superadmin.subs.overdueDays", { count: Math.abs(days) })
                              : t("superadmin.subs.inDays", { count: days })}
                          </p>
                        )}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-right font-medium text-emerald-700 dark:text-emerald-300">
                    {org.plan ? formatMoneyL(locale, org.plan.priceMonthly) : "-"}
                  </td>
                  <td className="px-5 py-2.5 text-right text-slate-400">{org._count.buildings}</td>
                  <td className="px-5 py-2.5 text-right text-slate-400">{org._count.users}</td>
                  <td className="px-5 py-2.5 text-right">
                    {org.isSuspended && <span className="text-[10px] font-medium text-red-400">{t("superadmin.subs.suspendedShort")}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
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
    red: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    slate: "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300",
  }

  return (
    <div className={`rounded-xl border p-4 ${urgent ? tones[tone] : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"}`}>
      <div className="mb-1 flex items-start justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <Icon className={`h-4 w-4 ${urgent ? "" : "text-slate-500"}`} />
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  )
}

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

function normalizeFilter(value: string): SubscriptionFilter {
  return FILTERS.some((filter) => filter.value === value) ? (value as SubscriptionFilter) : "all"
}

function statusWhere(
  filter: SubscriptionFilter,
  now: Date,
  in7Days: Date,
  in30Days: Date,
): Prisma.OrganizationWhereInput {
  switch (filter) {
    case "expired":
      return { isActive: true, planExpiresAt: { lt: now } }
    case "expiring7":
      return { isActive: true, planExpiresAt: { gte: now, lte: in7Days } }
    case "expiring30":
      return { isActive: true, planExpiresAt: { gt: in7Days, lte: in30Days } }
    case "ok":
      return { isActive: true, planExpiresAt: { gt: in30Days } }
    case "noExpiry":
      return { isActive: true, planExpiresAt: null }
    case "all":
    default:
      return { isActive: true }
  }
}

function filterTitleKey(filter: SubscriptionFilter) {
  switch (filter) {
    case "expired":
      return "superadmin.subs.groupTitle.expired" as const
    case "expiring7":
      return "superadmin.subs.groupTitle.expiring7" as const
    case "expiring30":
      return "superadmin.subs.groupTitle.expiring30" as const
    case "ok":
      return "superadmin.subs.groupTitle.ok" as const
    case "noExpiry":
      return "superadmin.subs.groupTitle.noExpiry" as const
    case "all":
    default:
      return "superadmin.subs.groupTitle.all" as const
  }
}

function filterAccent(filter: SubscriptionFilter): Accent {
  switch (filter) {
    case "expired":
      return "red"
    case "expiring7":
      return "amber"
    case "expiring30":
      return "blue"
    case "ok":
      return "emerald"
    case "noExpiry":
    case "all":
    default:
      return "slate"
  }
}

function filterHref(filter: SubscriptionFilter, query: string) {
  const params = new URLSearchParams()
  if (filter !== "all") params.set("status", filter)
  if (query) params.set("q", query)
  const qs = params.toString()
  return qs ? `/superadmin/subscriptions?${qs}` : "/superadmin/subscriptions"
}

function uniquePlanIds(...groupsList: PlanGroup[][]) {
  return Array.from(new Set(groupsList.flatMap((groups) => groups.map((group) => group.planId).filter(Boolean)))) as string[]
}

function mrrFromGroups(
  groups: PlanGroup[],
  planById: Map<string, { id: string; name: string; priceMonthly: number }>,
) {
  return groups.reduce((sum, group) => {
    if (!group.planId) return sum
    return sum + (planById.get(group.planId)?.priceMonthly ?? 0) * group._count._all
  }, 0)
}
