import { auth } from "@/auth"
import { db } from "@/lib/db"
import { STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS, REQUEST_TYPE_LABELS } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { ClipboardList } from "lucide-react"
import { RequestDialog } from "./request-dialog"

export default async function CabinetRequests() {
  const session = await auth()

  const tenant = await db.tenant.findUnique({
    where: { userId: session!.user.id },
    include: {
      requests: {
        orderBy: { createdAt: "desc" },
        include: { comments: true },
      },
    },
  })

  if (!tenant) return null

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Мои заявки</h1>
          <p className="text-sm text-slate-500 mt-0.5">{tenant.requests.length} заявок</p>
        </div>
        <RequestDialog />
      </div>

      <div className="space-y-3">
        {tenant.requests.map((r) => (
          <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-slate-900">{r.title}</h3>
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[r.status])}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", PRIORITY_COLORS[r.priority])}>
                    {PRIORITY_LABELS[r.priority] ?? r.priority}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-1">{r.description}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                  <span>{REQUEST_TYPE_LABELS[r.type] ?? r.type}</span>
                  <span>{new Date(r.createdAt).toLocaleDateString("ru-RU")}</span>
                  {r.comments.length > 0 && (
                    <span>{r.comments.length} комментариев</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {tenant.requests.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
            <ClipboardList className="h-10 w-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">Заявок нет</p>
            <p className="text-xs text-slate-400 mt-1">
              Создайте заявку на замену лампочки, подключение интернета или любой другой вопрос
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
