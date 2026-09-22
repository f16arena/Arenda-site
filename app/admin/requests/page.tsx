export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { STATUS_COLORS, PRIORITY_COLORS } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { ClipboardList } from "lucide-react"
import Link from "next/link"
import { DeleteAction } from "@/components/ui/delete-action"
import { EmptyState } from "@/components/ui/empty-state"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { RouteTabs } from "@/components/ui/route-tabs"
import { SERVICE_TABS } from "@/lib/hub-tabs"
import { PageHeader, Card } from "@/components/ui/page"
import { deleteRequest } from "@/app/actions/requests"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import { requestScope } from "@/lib/tenant-scope"
import { getCurrentBuildingId } from "@/lib/current-building"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { DEFAULT_PAGE_SIZE, normalizePage, pageSkip } from "@/lib/pagination"
import { safeServerValue } from "@/lib/server-fallback"
import { getT, getLocale } from "@/lib/i18n/server"
import { formatDateShortL } from "@/lib/i18n/format"
import type { Prisma } from "@/app/generated/prisma/client"

const REQUEST_FILTERS = [
  { key: "all", statuses: null },
  { key: "new", statuses: ["NEW"] },
  { key: "active", statuses: ["IN_PROGRESS", "POSTPONED"] },
  { key: "done", statuses: ["DONE", "CLOSED"] },
] as const

// Подписи статусов, приоритетов и типов берём из словаря; значение вне списка
// (старые записи в базе) показываем как есть.
const STATUS_KEYS = ["NEW", "IN_PROGRESS", "DONE", "CLOSED", "POSTPONED"] as const
const PRIORITY_KEYS = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const
const TYPE_KEYS = [
  "TECHNICAL", "INTERNET", "CLEANING", "QUESTION", "ELECTRICAL",
  "PLUMBING", "HVAC", "SECURITY", "ADMINISTRATIVE", "MAINTENANCE", "OTHER",
] as const

type RequestFilterKey = (typeof REQUEST_FILTERS)[number]["key"]

function normalizeFilter(value: string | string[] | undefined): RequestFilterKey {
  const raw = Array.isArray(value) ? value[0] : value
  return REQUEST_FILTERS.some((filter) => filter.key === raw) ? raw as RequestFilterKey : "all"
}

const PRIORITY_VALUES = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"])
const REQUEST_TYPE_VALUES = new Set([
  "TECHNICAL", "CLEANING", "ELECTRICAL", "PLUMBING", "HVAC",
  "SECURITY", "OTHER", "ADMINISTRATIVE", "MAINTENANCE",
])

function readParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    status?: string | string[]
    page?: string | string[]
    priority?: string | string[]
    type?: string | string[]
  }>
}) {
  const { orgId } = await requireOrgAccess()
  const { t } = await getT()
  const locale = await getLocale()
  const statusLabel = (value: string) =>
    STATUS_KEYS.includes(value as (typeof STATUS_KEYS)[number])
      ? t(`domain.statuses.${value as (typeof STATUS_KEYS)[number]}`)
      : value
  const priorityLabel = (value: string) =>
    PRIORITY_KEYS.includes(value as (typeof PRIORITY_KEYS)[number])
      ? t(`adminService.requests.priorities.${value as (typeof PRIORITY_KEYS)[number]}`)
      : value
  const typeLabel = (value: string) =>
    TYPE_KEYS.includes(value as (typeof TYPE_KEYS)[number])
      ? t(`adminService.requests.types.${value as (typeof TYPE_KEYS)[number]}`)
      : value
  // Гранулярные права: кнопки-действия показываются только при наличии своего права.
  const session = await auth()
  const caps = session?.user
    ? new Set(await getAllowedCapabilityKeysForUser({
        userId: session.user.id,
        role: session.user.role,
        isPlatformOwner: !!session.user.isPlatformOwner,
        orgId,
      }))
    : new Set<string>()
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/admin/requests", orgId })
  const resolvedSearchParams = await searchParams
  const selectedFilter = normalizeFilter(resolvedSearchParams?.status)
  const page = normalizePage(resolvedSearchParams?.page)
  const rawPriority = readParam(resolvedSearchParams?.priority).toUpperCase()
  const selectedPriority = PRIORITY_VALUES.has(rawPriority) ? rawPriority : ""
  const rawType = readParam(resolvedSearchParams?.type).toUpperCase()
  const selectedType = REQUEST_TYPE_VALUES.has(rawType) ? rawType : ""
  const selectedFilterConfig = REQUEST_FILTERS.find((filter) => filter.key === selectedFilter) ?? REQUEST_FILTERS[0]
  const currentBuildingId = await getCurrentBuildingId()
  if (currentBuildingId) await assertBuildingInOrg(currentBuildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const visibleBuildingIds = currentBuildingId ? [currentBuildingId] : accessibleBuildingIds
  const tenantBuildingWhere = {
    OR: [
      { space: { floor: { buildingId: { in: visibleBuildingIds } } } },
      { tenantSpaces: { some: { space: { floor: { buildingId: { in: visibleBuildingIds } } } } } },
      { fullFloors: { some: { buildingId: { in: visibleBuildingIds } } } },
      { buildingId: { in: visibleBuildingIds } },
    ],
  }
  const selectedStatuses = selectedFilterConfig.statuses as readonly string[] | null
  const baseWhere: Prisma.RequestWhereInput = { AND: [requestScope(orgId), { tenant: tenantBuildingWhere }] }
  const extraConditions: Prisma.RequestWhereInput[] = []
  if (selectedStatuses) extraConditions.push({ status: { in: [...selectedStatuses] } })
  if (selectedPriority) extraConditions.push({ priority: selectedPriority })
  if (selectedType) extraConditions.push({ type: selectedType })
  const requestsWhere: Prisma.RequestWhereInput = extraConditions.length > 0
    ? { AND: [baseWhere, ...extraConditions] }
    : baseWhere

  const [requests, totalRequests, statusGroups, totalAllRequests] = await Promise.all([
    safe(
      "admin.requests.items",
      db.request.findMany({
        where: requestsWhere,
        select: {
          id: true, title: true, description: true, type: true,
          priority: true, status: true, createdAt: true,
          tenant: { select: { id: true, companyName: true } },
          user: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: pageSkip(page),
        take: DEFAULT_PAGE_SIZE,
      }),
      [],
    ),
    safe("admin.requests.total", db.request.count({ where: requestsWhere }), 0),
    safe(
      "admin.requests.statusGroups",
      db.request.groupBy({
        by: ["status"],
        where: baseWhere,
        _count: { _all: true },
      }),
      [],
    ),
    safe("admin.requests.totalAll", db.request.count({ where: baseWhere }), 0),
  ])

  const countByStatus = new Map(statusGroups.map((group) => [group.status, group._count._all]))

  const filterCounts = REQUEST_FILTERS.reduce<Record<RequestFilterKey, number>>((acc, filter) => {
    const statuses = filter.statuses as readonly string[] | null
    acc[filter.key] = statuses
      ? statuses.reduce((sum, status) => sum + (countByStatus.get(status) ?? 0), 0)
      : totalAllRequests
    return acc
  }, { all: 0, new: 0, active: 0, done: 0 })

  return (
    <div className="space-y-5">
      <RouteTabs items={SERVICE_TABS} className="mb-2" />
      <PageHeader
        icon={ClipboardList}
        title={t("adminService.requests.title")}
        subtitle={t("adminService.requests.subtitle", { new: filterCounts.new, active: filterCounts.active })}
      />

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {REQUEST_FILTERS.map((filter) => {
            const active = selectedFilter === filter.key
            const params = new URLSearchParams()
            if (filter.key !== "all") params.set("status", filter.key)
            if (selectedPriority) params.set("priority", selectedPriority)
            if (selectedType) params.set("type", selectedType)
            const qs = params.toString()
            return (
              <Link
                key={filter.key}
                href={qs ? `/admin/requests?${qs}` : "/admin/requests"}
                className={cn(
                  "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/50",
                )}
              >
                {t(`adminService.requests.filters.${filter.key}`)}
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  {filterCounts[filter.key]}
                </span>
              </Link>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">{t("adminService.requests.priorityLabel")}</span>
          {(["all", ...PRIORITY_KEYS] as const).map((key) => {
            const value = key === "all" ? "" : key
            const active = (selectedPriority || "") === value
            const params = new URLSearchParams()
            if (selectedFilter !== "all") params.set("status", selectedFilter)
            if (value) params.set("priority", value)
            if (selectedType) params.set("type", selectedType)
            const qs = params.toString()
            return (
              <Link
                key={key}
                href={qs ? `/admin/requests?${qs}` : "/admin/requests"}
                className={cn(
                  "text-[11px] rounded-full px-2.5 py-0.5 border transition-colors",
                  active
                    ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/30 dark:text-slate-300 dark:hover:bg-slate-800/60",
                )}
              >
                {t(`adminService.requests.priorities.${key}`)}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Table */}
      <Card padded={false} className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminService.requests.columns.request")}</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminService.requests.columns.tenant")}</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminService.requests.columns.type")}</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminService.requests.columns.priority")}</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminService.requests.columns.status")}</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminService.requests.columns.date")}</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-5 py-3.5">
                  <Link href={`/admin/requests/${r.id}`} className="block">
                    <p className="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400">{r.title}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-xs">{r.description}</p>
                  </Link>
                </td>
                <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400">{r.tenant.companyName}</td>
                <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400">
                  {typeLabel(r.type)}
                </td>
                <td className="px-5 py-3.5">
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", PRIORITY_COLORS[r.priority])}>
                    {priorityLabel(r.priority)}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[r.status])}>
                    {statusLabel(r.status)}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-slate-400 dark:text-slate-500 text-xs">
                  {formatDateShortL(locale, r.createdAt)}
                </td>
                <td className="px-5 py-3.5">
                  {caps.has("requests.manage") && (
                    <DeleteAction
                      action={deleteRequest.bind(null, r.id)}
                      entity={t("adminService.requests.deleteEntity")}
                      successMessage={t("adminService.requests.deleted")}
                    />
                  )}
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8">
                  {totalAllRequests === 0 ? (
                    <EmptyState
                      icon={<ClipboardList className="h-5 w-5" />}
                      title={t("adminService.requests.emptyTitle")}
                      description={t("adminService.requests.emptyDescription")}
                      actions={[
                        { href: "/admin/tenants", label: t("adminService.requests.emptyOpenTenants") },
                        { href: "/admin/faq", label: t("adminService.requests.emptyOpenFaq"), variant: "secondary" },
                      ]}
                    />
                  ) : (
                    <EmptyState
                      icon={<ClipboardList className="h-5 w-5" />}
                      title={t("adminService.requests.filterEmptyTitle")}
                      description={t("adminService.requests.filterEmptyDescription")}
                      actions={[
                        { href: "/admin/requests", label: t("adminService.requests.showAll") },
                      ]}
                    />
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <PaginationControls
          basePath="/admin/requests"
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          total={totalRequests}
          params={{
            status: selectedFilter !== "all" ? selectedFilter : null,
            priority: selectedPriority || null,
            type: selectedType || null,
          }}
        />
      </Card>
    </div>
  )
}
