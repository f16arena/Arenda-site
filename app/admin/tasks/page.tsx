export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { formatMoney, STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS } from "@/lib/utils"
import { Calendar, CheckSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { TaskDialog } from "./task-dialog"
import { updateTaskStatus, deleteTask } from "@/app/actions/tasks"
import { DeleteAction } from "@/components/ui/delete-action"
import { EmptyState } from "@/components/ui/empty-state"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { requireOrgAccess } from "@/lib/org"
import { taskScope } from "@/lib/tenant-scope"
import { getCurrentBuildingId } from "@/lib/current-building"
import { assertBuildingInOrg } from "@/lib/scope-guards"
import { getAccessibleBuildingIdsForSession } from "@/lib/building-access"
import { DEFAULT_PAGE_SIZE, normalizePage, pageSkip } from "@/lib/pagination"
import type { Prisma } from "@/app/generated/prisma/client"
import Link from "next/link"

const TASK_FILTERS = [
  { key: "all", label: "Все", statuses: null, color: "text-slate-700 dark:text-slate-300" },
  { key: "new", label: "Новые", statuses: ["NEW"], color: "text-blue-700 dark:text-blue-300" },
  { key: "active", label: "В работе", statuses: ["IN_PROGRESS"], color: "text-amber-700 dark:text-amber-300" },
  { key: "done", label: "Выполнены", statuses: ["DONE"], color: "text-emerald-700 dark:text-emerald-300" },
] as const

type TaskFilterKey = (typeof TASK_FILTERS)[number]["key"]

function normalizeFilter(value: string | string[] | undefined): TaskFilterKey {
  const raw = Array.isArray(value) ? value[0] : value
  return TASK_FILTERS.some((filter) => filter.key === raw) ? raw as TaskFilterKey : "all"
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string | string[]; page?: string | string[] }>
}) {
  const { orgId } = await requireOrgAccess()
  const resolvedSearchParams = await searchParams
  const selectedFilter = normalizeFilter(resolvedSearchParams?.status)
  const page = normalizePage(resolvedSearchParams?.page)
  const selectedFilterConfig = TASK_FILTERS.find((filter) => filter.key === selectedFilter) ?? TASK_FILTERS[0]
  const currentBuildingId = await getCurrentBuildingId()
  if (currentBuildingId) await assertBuildingInOrg(currentBuildingId, orgId)
  const accessibleBuildingIds = await getAccessibleBuildingIdsForSession(orgId)
  const visibleBuildingIds = currentBuildingId ? [currentBuildingId] : accessibleBuildingIds
  const selectedStatuses = selectedFilterConfig.statuses as readonly string[] | null
  const baseWhere: Prisma.TaskWhereInput = {
    AND: [
      taskScope(orgId),
      {
        OR: [
          { buildingId: { in: visibleBuildingIds } },
          { buildingId: null, createdBy: { organizationId: orgId } },
        ],
      },
    ],
  }
  const tasksWhere: Prisma.TaskWhereInput = selectedStatuses
    ? { AND: [baseWhere, { status: { in: [...selectedStatuses] } }] }
    : baseWhere

  const [tasks, totalTasks, statusGroups, totalAllTasks, staffUsers, buildingOptions] = await Promise.all([
    db.task.findMany({
      where: tasksWhere,
      select: {
        id: true, title: true, description: true, category: true,
        priority: true, status: true, floorNumber: true, spaceNumber: true,
        estimatedCost: true, actualCost: true, dueDate: true, createdAt: true,
        createdBy: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: pageSkip(page),
      take: DEFAULT_PAGE_SIZE,
    }).catch(() => []),
    db.task.count({ where: tasksWhere }).catch(() => 0),
    db.task.groupBy({
      by: ["status"],
      where: baseWhere,
      _count: { _all: true },
    }).catch(() => []),
    db.task.count({ where: baseWhere }).catch(() => 0),
    db.user.findMany({
      where: { role: { not: "TENANT" }, isActive: true, organizationId: orgId },
      select: { id: true, name: true },
    }).catch(() => []),
    db.building.findMany({
      where: { id: { in: visibleBuildingIds }, organizationId: orgId, isActive: true },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }).catch(() => []),
  ])

  const countByStatus = new Map(statusGroups.map((group) => [group.status, group._count._all]))

  const filterCounts = TASK_FILTERS.reduce<Record<TaskFilterKey, number>>((acc, filter) => {
    const statuses = filter.statuses as readonly string[] | null
    acc[filter.key] = statuses
      ? statuses.reduce((sum, status) => sum + (countByStatus.get(status) ?? 0), 0)
      : totalAllTasks
    return acc
  }, { all: 0, new: 0, active: 0, done: 0 })

  const stats = {
    total: totalAllTasks,
    new: filterCounts.new,
    inProgress: filterCounts.active,
    done: filterCounts.done,
  }

  const CATEGORY_LABELS: Record<string, string> = {
    REPAIR: "Ремонт",
    PLUMBING: "Сантехника",
    ELECTRICAL: "Электрика",
    CLEANING: "Уборка",
    SECURITY: "Безопасность",
    OTHER: "Прочее",
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Задачи</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">{stats.total} задач · {stats.inProgress} в работе</p>
        </div>
        <TaskDialog staffUsers={staffUsers} buildings={buildingOptions} currentBuildingId={currentBuildingId} />
      </div>

      {/* Status tabs */}
      <div className="flex gap-2">
        {TASK_FILTERS.map((tab) => {
          const active = selectedFilter === tab.key
          return (
          <Link
            key={tab.key}
            href={tab.key === "all" ? "/admin/tasks" : `/admin/tasks?status=${tab.key}`}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/50",
            )}
          >
            {tab.label}
            <span className={`rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold ${tab.color}`}>
              {filterCounts[tab.key]}
            </span>
          </Link>
        )})}
      </div>

      {/* Tasks list */}
      <div className="space-y-3">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{task.title}</h3>
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[task.status] ?? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500")}>
                    {STATUS_LABELS[task.status] ?? task.status}
                  </span>
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", PRIORITY_COLORS[task.priority] ?? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 dark:text-slate-500")}>
                    {PRIORITY_LABELS[task.priority] ?? task.priority}
                  </span>
                  {task.category && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 dark:text-slate-500">
                      {CATEGORY_LABELS[task.category] ?? task.category}
                    </span>
                  )}
                </div>
                {task.description && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1 line-clamp-2">{task.description}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 dark:text-slate-500 flex-wrap">
                  {task.floorNumber !== null && <span>Этаж {task.floorNumber}</span>}
                  {task.spaceNumber && <span>Каб. {task.spaceNumber}</span>}
                  {task.assignedTo && <span>Исполнитель: <span className="text-slate-600 dark:text-slate-400 dark:text-slate-500">{task.assignedTo.name}</span></span>}
                  <span>Создал: {task.createdBy.name}</span>
                  {task.dueDate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      До {new Date(task.dueDate).toLocaleDateString("ru-RU")}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                {task.estimatedCost !== null && (
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">~{formatMoney(task.estimatedCost)}</p>
                )}
                {task.actualCost !== null && (
                  <p className="text-xs text-slate-400 dark:text-slate-500">Факт: {formatMoney(task.actualCost)}</p>
                )}
                {/* Quick status change */}
                <div className="flex items-center gap-2">
                  {task.status === "NEW" && (
                    <form action={async () => { "use server"; await updateTaskStatus(task.id, "IN_PROGRESS") }}>
                      <button type="submit" className="text-xs px-2 py-1 rounded bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:bg-amber-500/30">
                        В работу
                      </button>
                    </form>
                  )}
                  {task.status === "IN_PROGRESS" && (
                    <form action={async () => { "use server"; await updateTaskStatus(task.id, "DONE") }}>
                      <button type="submit" className="text-xs px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:bg-emerald-500/30">
                        Выполнено
                      </button>
                    </form>
                  )}
                  <DeleteAction
                    action={deleteTask.bind(null, task.id)}
                    entity="задачу"
                    successMessage="Задача удалена"
                  />
                </div>
              </div>
            </div>
          </div>
        ))}

        {tasks.length === 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 py-16 text-center">
            {totalAllTasks === 0 ? (
              <EmptyState
                icon={<CheckSquare className="h-5 w-5" />}
                title="Задач пока нет"
                description="Создавайте задачи на ремонт, обслуживание, уборку и другие работы по зданию, чтобы видеть ответственного, срок и статус."
                actions={[
                  { href: "/admin/staff", label: "Проверить сотрудников" },
                  { href: "/admin/faq", label: "Как вести задачи", variant: "secondary" },
                ]}
              />
            ) : (
              <EmptyState
                icon={<CheckSquare className="h-5 w-5" />}
                title="В этом фильтре задач нет"
                description="Выберите другой статус или вернитесь ко всем задачам, чтобы увидеть полный список работ."
                actions={[
                  { href: "/admin/tasks", label: "Показать все" },
                ]}
              />
            )}
          </div>
        )}
      </div>
      <PaginationControls
        basePath="/admin/tasks"
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        total={totalTasks}
        params={{ status: selectedFilter }}
      />
    </div>
  )
}
