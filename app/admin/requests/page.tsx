export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS, REQUEST_TYPE_LABELS } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { ClipboardList } from "lucide-react"
import Link from "next/link"
import { DeleteAction } from "@/components/ui/delete-action"
import { EmptyState } from "@/components/ui/empty-state"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { deleteRequest } from "@/app/actions/requests"
import { requireOrgAccess } from "@/lib/org"
import { requestScope } from "@/lib/tenant-scope"
import { getCurrentBuildingId } from "@/lib/current-building"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { DEFAULT_PAGE_SIZE, normalizePage, pageSkip } from "@/lib/pagination"
import type { Prisma } from "@/app/generated/prisma/client"

const REQUEST_FILTERS = [
  { key: "all", label: "Все", statuses: null },
  { key: "new", label: "Новые", statuses: ["NEW"] },
  { key: "active", label: "В работе", statuses: ["IN_PROGRESS", "POSTPONED"] },
  { key: "done", label: "Выполнены", statuses: ["DONE", "CLOSED"] },
] as const

type RequestFilterKey = (typeof REQUEST_FILTERS)[number]["key"]

function normalizeFilter(value: string | string[] | undefined): RequestFilterKey {
  const raw = Array.isArray(value) ? value[0] : value
  return REQUEST_FILTERS.some((filter) => filter.key === raw) ? raw as RequestFilterKey : "all"
}

export default async function RequestsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string | string[]; page?: string | string[] }>
}) {
  const { orgId } = await requireOrgAccess()
  const resolvedSearchParams = await searchParams
  const selectedFilter = normalizeFilter(resolvedSearchParams?.status)
  const page = normalizePage(resolvedSearchParams?.page)
  const selectedFilterConfig = REQUEST_FILTERS.find((filter) => filter.key === selectedFilter) ?? REQUEST_FILTERS[0]
  const currentBuildingId = await getCurrentBuildingId()
  if (currentBuildingId) await assertBuildingInOrg(currentBuildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const visibleBuildingIds = currentBuildingId ? [currentBuildingId] : accessibleBuildingIds
  const tenantBuildingWhere = {
    OR: [
      { space: { floor: { buildingId: { in: visibleBuildingIds } } } },
      { fullFloors: { some: { buildingId: { in: visibleBuildingIds } } } },
    ],
  }
  const selectedStatuses = selectedFilterConfig.statuses as readonly string[] | null
  const baseWhere: Prisma.RequestWhereInput = { AND: [requestScope(orgId), { tenant: tenantBuildingWhere }] }
  const requestsWhere: Prisma.RequestWhereInput = selectedStatuses
    ? { AND: [baseWhere, { status: { in: [...selectedStatuses] } }] }
    : baseWhere

  const [requests, totalRequests, statusGroups, totalAllRequests] = await Promise.all([
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
    }).catch(() => []),
    db.request.count({ where: requestsWhere }).catch(() => 0),
    db.request.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { _all: true },
    }).catch(() => []),
    db.request.count({ where: baseWhere }).catch(() => 0),
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
      <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Заявки арендаторов</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">
          {filterCounts.new} новых · {filterCounts.active} в работе
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        {REQUEST_FILTERS.map((filter) => {
          const active = selectedFilter === filter.key
          return (
          <Link
            key={filter.key}
            href={filter.key === "all" ? "/admin/requests" : `/admin/requests?status=${filter.key}`}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/50",
            )}
          >
            {filter.label}
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              {filterCounts[filter.key]}
            </span>
          </Link>
        )})}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Заявка</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Арендатор</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Тип</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Приоритет</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Статус</th>
              <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 dark:text-slate-500">Дата</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50 transition-colors">
                <td className="px-5 py-3.5">
                  <Link href={`/admin/requests/${r.id}`} className="block">
                    <p className="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:text-blue-400">{r.title}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-xs">{r.description}</p>
                  </Link>
                </td>
                <td className="px-5 py-3.5 text-slate-600 dark:text-slate-400 dark:text-slate-500">{r.tenant.companyName}</td>
                <td className="px-5 py-3.5 text-slate-500 dark:text-slate-400 dark:text-slate-500">
                  {REQUEST_TYPE_LABELS[r.type] ?? r.type}
                </td>
                <td className="px-5 py-3.5">
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", PRIORITY_COLORS[r.priority])}>
                    {PRIORITY_LABELS[r.priority] ?? r.priority}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[r.status])}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-slate-400 dark:text-slate-500 text-xs">
                  {new Date(r.createdAt).toLocaleDateString("ru-RU")}
                </td>
                <td className="px-5 py-3.5">
                  <DeleteAction
                    action={deleteRequest.bind(null, r.id)}
                    entity="заявку"
                    successMessage="Заявка удалена"
                  />
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8">
                  {totalAllRequests === 0 ? (
                    <EmptyState
                      icon={<ClipboardList className="h-5 w-5" />}
                      title="Заявок пока нет"
                      description="Заявки появятся здесь, когда арендатор отправит обращение из кабинета. Проверьте, что у арендаторов есть доступ и они знают, где создать заявку."
                      actions={[
                        { href: "/admin/tenants", label: "Открыть арендаторов" },
                        { href: "/admin/faq", label: "FAQ для инструкции", variant: "secondary" },
                      ]}
                    />
                  ) : (
                    <EmptyState
                      icon={<ClipboardList className="h-5 w-5" />}
                      title="В этом фильтре заявок нет"
                      description="Выберите другой статус или вернитесь ко всем заявкам, чтобы увидеть полный список обращений."
                      actions={[
                        { href: "/admin/requests", label: "Показать все" },
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
          params={{ status: selectedFilter }}
        />
      </div>
    </div>
  )
}
