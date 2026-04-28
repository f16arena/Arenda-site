import { db } from "@/lib/db"
import { auth } from "@/auth"
import { notFound } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS, REQUEST_TYPE_LABELS,
} from "@/lib/utils"
import { ArrowLeft, User } from "lucide-react"
import Link from "next/link"
import { addRequestComment, updateRequestStatus } from "@/app/actions/requests"

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()

  const [request, staff] = await Promise.all([
    db.request.findUnique({
      where: { id },
      include: {
        tenant: true,
        user: { select: { name: true } },
        comments: {
          include: { author: { select: { name: true, role: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    db.user.findMany({
      where: { role: { not: "TENANT" }, isActive: true },
      select: { id: true, name: true, role: true },
    }),
  ])

  if (!request) notFound()

  const statusFlow: Record<string, string[]> = {
    NEW: ["IN_PROGRESS"],
    IN_PROGRESS: ["DONE", "POSTPONED"],
    DONE: ["CLOSED"],
    POSTPONED: ["IN_PROGRESS", "CLOSED"],
    CLOSED: [],
  }

  const nextStatuses = statusFlow[request.status] ?? []

  const statusBtnColor: Record<string, string> = {
    IN_PROGRESS: "bg-amber-500 hover:bg-amber-600 text-white",
    DONE: "bg-emerald-600 hover:bg-emerald-700 text-white",
    CLOSED: "bg-slate-500 hover:bg-slate-600 text-white",
    POSTPONED: "bg-slate-200 hover:bg-slate-300 text-slate-700",
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/requests" className="text-slate-400 hover:text-slate-600">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{request.title}</h1>
          <p className="text-sm text-slate-500">
            {request.tenant.companyName} · {new Date(request.createdAt).toLocaleDateString("ru-RU")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Main info */}
        <div className="col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm text-slate-700 leading-relaxed">{request.description}</p>
          </div>

          {/* Comments */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-900">Комментарии</p>
            </div>
            <div className="divide-y divide-slate-50">
              {request.comments.map((c) => (
                <div key={c.id} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-slate-600">{c.author.name[0]?.toUpperCase()}</span>
                    </div>
                    <span className="text-xs font-medium text-slate-700">{c.author.name}</span>
                    <span className="text-xs text-slate-400">{new Date(c.createdAt).toLocaleDateString("ru-RU")}</span>
                  </div>
                  <p className="text-sm text-slate-700 pl-8">{c.text}</p>
                </div>
              ))}
              {request.comments.length === 0 && (
                <p className="px-5 py-6 text-sm text-slate-400 text-center">Комментариев нет</p>
              )}
            </div>
            {request.status !== "CLOSED" && (
              <div className="px-5 py-4 border-t border-slate-100 bg-slate-50">
                <form action={async (fd) => {
                  "use server"
                  await addRequestComment(id, fd)
                }}>
                  <div className="flex gap-3">
                    <div className="h-7 w-7 rounded-full bg-slate-700 flex items-center justify-center shrink-0 mt-1">
                      <User className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="flex-1">
                      <textarea
                        name="text"
                        required
                        rows={2}
                        placeholder="Добавить комментарий..."
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none bg-white"
                      />
                      <div className="flex justify-end mt-2">
                        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
                          Отправить
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div>
              <p className="text-xs text-slate-400 mb-1">Статус</p>
              <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[request.status])}>
                {STATUS_LABELS[request.status] ?? request.status}
              </span>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Приоритет</p>
              <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", PRIORITY_COLORS[request.priority])}>
                {PRIORITY_LABELS[request.priority] ?? request.priority}
              </span>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Тип</p>
              <p className="text-sm text-slate-700">{REQUEST_TYPE_LABELS[request.type] ?? request.type}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Арендатор</p>
              <p className="text-sm text-slate-700">{request.tenant.companyName}</p>
            </div>

            {/* Assignee */}
            <div>
              <p className="text-xs text-slate-400 mb-1.5">Исполнитель</p>
              <form action={async (fd) => {
                "use server"
                const assigneeId = fd.get("assigneeId") as string
                await updateRequestStatus(id, request.status, assigneeId || undefined)
              }}>
                <select name="assigneeId" defaultValue={request.assigneeId ?? ""}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs bg-white focus:border-blue-500 focus:outline-none">
                  <option value="">Не назначен</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button type="submit" className="mt-1.5 w-full rounded-lg border border-slate-200 py-1 text-xs text-slate-600 hover:bg-slate-50">
                  Назначить
                </button>
              </form>
            </div>
          </div>

          {/* Status transitions */}
          {nextStatuses.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
              <p className="text-xs font-medium text-slate-500 mb-2">Изменить статус</p>
              {nextStatuses.map((s) => (
                <form key={s} action={async () => {
                  "use server"
                  await updateRequestStatus(id, s)
                }}>
                  <button type="submit"
                    className={cn("w-full rounded-lg py-2 text-xs font-medium transition-colors", statusBtnColor[s])}>
                    {STATUS_LABELS[s] ?? s}
                  </button>
                </form>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
