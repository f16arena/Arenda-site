export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { formatMoney, STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS } from "@/lib/utils"
import { Calendar } from "lucide-react"
import { cn } from "@/lib/utils"
import { TaskDialog } from "./task-dialog"
import { updateTaskStatus } from "@/app/actions/tasks"

export default async function TasksPage() {
  const tasks = await db.task.findMany({
    include: {
      createdBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const staffUsers = await db.user.findMany({
    where: { role: { not: "TENANT" }, isActive: true },
    select: { id: true, name: true },
  })

  const stats = {
    total: tasks.length,
    new: tasks.filter((t) => t.status === "NEW").length,
    inProgress: tasks.filter((t) => t.status === "IN_PROGRESS").length,
    done: tasks.filter((t) => t.status === "DONE").length,
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
          <h1 className="text-2xl font-semibold text-slate-900">Задачи</h1>
          <p className="text-sm text-slate-500 mt-0.5">{stats.total} задач · {stats.inProgress} в работе</p>
        </div>
        <TaskDialog staffUsers={staffUsers} />
      </div>

      {/* Status tabs */}
      <div className="flex gap-2">
        {[
          { label: "Все", count: stats.total, color: "text-slate-700" },
          { label: "Новые", count: stats.new, color: "text-blue-700" },
          { label: "В работе", count: stats.inProgress, color: "text-amber-700" },
          { label: "Выполнены", count: stats.done, color: "text-emerald-700" },
        ].map((tab) => (
          <div
            key={tab.label}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-white border border-slate-200 text-slate-700"
          >
            {tab.label}
            <span className={`rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold ${tab.color}`}>
              {tab.count}
            </span>
          </div>
        ))}
      </div>

      {/* Tasks list */}
      <div className="space-y-3">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-slate-900">{task.title}</h3>
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[task.status] ?? "bg-slate-100 text-slate-500")}>
                    {STATUS_LABELS[task.status] ?? task.status}
                  </span>
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", PRIORITY_COLORS[task.priority] ?? "bg-slate-100 text-slate-500")}>
                    {PRIORITY_LABELS[task.priority] ?? task.priority}
                  </span>
                  {task.category && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                      {CATEGORY_LABELS[task.category] ?? task.category}
                    </span>
                  )}
                </div>
                {task.description && (
                  <p className="text-sm text-slate-500 mt-1 line-clamp-2">{task.description}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 flex-wrap">
                  {task.floorNumber !== null && <span>Этаж {task.floorNumber}</span>}
                  {task.spaceNumber && <span>Каб. {task.spaceNumber}</span>}
                  {task.assignedTo && <span>Исполнитель: <span className="text-slate-600">{task.assignedTo.name}</span></span>}
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
                  <p className="text-sm font-medium text-slate-700">~{formatMoney(task.estimatedCost)}</p>
                )}
                {task.actualCost !== null && (
                  <p className="text-xs text-slate-400">Факт: {formatMoney(task.actualCost)}</p>
                )}
                {/* Quick status change */}
                <div className="flex gap-1">
                  {task.status === "NEW" && (
                    <form action={async () => { "use server"; await updateTaskStatus(task.id, "IN_PROGRESS") }}>
                      <button type="submit" className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200">
                        В работу
                      </button>
                    </form>
                  )}
                  {task.status === "IN_PROGRESS" && (
                    <form action={async () => { "use server"; await updateTaskStatus(task.id, "DONE") }}>
                      <button type="submit" className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
                        Выполнено
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {tasks.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
            <p className="text-slate-400 text-sm">Задачи не созданы</p>
          </div>
        )}
      </div>
    </div>
  )
}
