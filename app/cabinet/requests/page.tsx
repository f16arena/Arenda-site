import { auth } from "@/auth"
import { db } from "@/lib/db"
import { STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS, REQUEST_TYPE_LABELS } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { ClipboardList, Paperclip } from "lucide-react"
import { RequestDialog } from "./request-dialog"

export default async function CabinetRequests() {
  const session = await auth()

  const tenant = await db.tenant.findUnique({
    where: { userId: session!.user.id },
    include: {
      requests: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { _count: { select: { comments: true } } },
      },
    },
  })

  if (!tenant) return null

  const activeRequests = tenant.requests.filter((request) => !["DONE", "CLOSED", "CANCELLED"].includes(request.status)).length
  const waitingRequests = tenant.requests.filter((request) => ["NEW", "OPEN"].includes(request.status)).length
  const doneRequests = tenant.requests.filter((request) => ["DONE", "CLOSED"].includes(request.status)).length

  const requestIds = tenant.requests.map((request) => request.id)
  const attachments = requestIds.length > 0
    ? await db.storedFile.findMany({
        where: {
          tenantId: tenant.id,
          ownerType: "REQUEST_ATTACHMENT",
          ownerId: { in: requestIds },
          deletedAt: null,
        },
        select: { id: true, ownerId: true, fileName: true, mimeType: true },
        orderBy: { createdAt: "asc" },
      })
    : []
  const attachmentsByRequest = new Map<string, typeof attachments>()
  for (const file of attachments) {
    if (!file.ownerId) continue
    const list = attachmentsByRequest.get(file.ownerId) ?? []
    list.push(file)
    attachmentsByRequest.set(file.ownerId, list)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Мои заявки</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-0.5">{tenant.requests.length} заявок</p>
        </div>
        <RequestDialog />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <RequestStat label="Активные" value={activeRequests} tone="blue" />
        <RequestStat label="Ожидают принятия" value={waitingRequests} tone="amber" />
        <RequestStat label="Закрытые" value={doneRequests} tone="emerald" />
      </div>

      <div className="space-y-3">
        {tenant.requests.map((r) => (
          <div key={r.id} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 hover:shadow-sm transition-shadow">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{r.title}</h3>
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[r.status])}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", PRIORITY_COLORS[r.priority])}>
                    {PRIORITY_LABELS[r.priority] ?? r.priority}
                  </span>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-500 mt-1">{r.description}</p>
                {(attachmentsByRequest.get(r.id)?.length ?? 0) > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {attachmentsByRequest.get(r.id)?.map((file) => (
                      <a
                        key={file.id}
                        href={`/api/storage/${file.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        {file.mimeType.startsWith("image/") ? "Фото" : "Файл"}
                      </a>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-400 dark:text-slate-500">
                  <span>{REQUEST_TYPE_LABELS[r.type] ?? r.type}</span>
                  <span>{new Date(r.createdAt).toLocaleDateString("ru-RU")}</span>
                  {r._count.comments > 0 && (
                    <span>{r._count.comments} комментариев</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {tenant.requests.length === 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 py-16 text-center">
            <ClipboardList className="h-10 w-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 dark:text-slate-500">Заявок нет</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Создайте заявку на замену лампочки, подключение интернета или любой другой вопрос
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function RequestStat({ label, value, tone }: { label: string; value: number; tone: "blue" | "amber" | "emerald" }) {
  const toneClass = tone === "blue"
    ? "text-blue-600 dark:text-blue-300"
    : tone === "amber"
      ? "text-amber-600 dark:text-amber-300"
      : "text-emerald-600 dark:text-emerald-300"

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  )
}
