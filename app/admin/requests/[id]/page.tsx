import { db } from "@/lib/db"
import { assertTenantBuildingAccess } from "@/lib/building-access"
import { notFound } from "next/navigation"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"
import { assertRequestInOrg } from "@/lib/scope-guards"
import { cn } from "@/lib/utils"
import { STATUS_COLORS, PRIORITY_COLORS } from "@/lib/utils"
import { getT, getLocale } from "@/lib/i18n/server"
import { formatDateShortL } from "@/lib/i18n/format"
import { ArrowLeft, Paperclip, User } from "lucide-react"
import Link from "next/link"
import { addRequestComment, updateRequestStatus } from "@/app/actions/requests"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

// Подписи статусов, приоритетов и типов — из словаря; неизвестное значение
// (старые записи) показываем как есть.
const STATUS_KEYS = ["NEW", "IN_PROGRESS", "DONE", "CLOSED", "POSTPONED"] as const
const PRIORITY_KEYS = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const
const TYPE_KEYS = [
  "TECHNICAL", "INTERNET", "CLEANING", "QUESTION", "ELECTRICAL",
  "PLUMBING", "HVAC", "SECURITY", "ADMINISTRATIVE", "MAINTENANCE", "OTHER",
] as const

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
  const canManage = caps.has("requests.manage")
  try {
    await assertRequestInOrg(id, orgId)
  } catch {
    notFound()
  }

  const [request, staff, attachments] = await Promise.all([
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
      where: { role: { not: "TENANT" }, isActive: true, organizationId: orgId },
      select: { id: true, name: true, role: true },
    }),
    db.storedFile.findMany({
      where: {
        organizationId: orgId,
        ownerType: "REQUEST_ATTACHMENT",
        ownerId: id,
        deletedAt: null,
      },
      select: { id: true, fileName: true, mimeType: true, originalSize: true },
      orderBy: { createdAt: "asc" },
    }),
  ])

  if (!request) notFound()
  if (request.tenantId) {
    try { await assertTenantBuildingAccess(request.tenantId, orgId) } catch { notFound() }
  }

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
    POSTPONED: "bg-slate-200 hover:bg-slate-300 text-slate-700 dark:text-slate-300",
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/requests" className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{request.title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {request.tenant.companyName} · {formatDateShortL(locale, request.createdAt)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Main info */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="block p-5">
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{request.description}</p>
            {attachments.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {attachments.map((file) => (
                  <a
                    key={file.id}
                    href={`/api/storage/${file.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    {file.mimeType.startsWith("image/") ? t("adminService.requests.detail.photo") : file.fileName}
                  </a>
                ))}
              </div>
            )}
          </Card>

          {/* Comments */}
          <Card className="block overflow-hidden p-0">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("adminService.requests.detail.comments")}</p>
            </div>
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {request.comments.map((c) => (
                <div key={c.id} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400">{c.author.name[0]?.toUpperCase()}</span>
                    </div>
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{c.author.name}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">{formatDateShortL(locale, c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 pl-8">{c.text}</p>
                </div>
              ))}
              {request.comments.length === 0 && (
                <p className="px-5 py-6 text-sm text-slate-400 dark:text-slate-500 text-center">{t("adminService.requests.detail.noComments")}</p>
              )}
            </div>
            {canManage && request.status !== "CLOSED" && (
              <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <form action={async (fd) => {
                  "use server"
                  await addRequestComment(id, fd)
                }}>
                  <div className="flex gap-3">
                    <div className="h-7 w-7 rounded-full bg-slate-700 flex items-center justify-center shrink-0 mt-1">
                      <User className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="flex-1">
                      <Textarea
                        name="text"
                        required
                        rows={2}
                        placeholder={t("adminService.requests.detail.commentPlaceholder")}
                        className="resize-none"
                      />
                      <div className="flex justify-end mt-2">
                        <Button type="submit" size="sm" className="font-medium">
                          {t("adminService.requests.detail.send")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card className="block p-5 space-y-4">
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">{t("adminService.requests.detail.status")}</p>
              <Badge className={cn(STATUS_COLORS[request.status])}>
                {statusLabel(request.status)}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">{t("adminService.requests.detail.priority")}</p>
              <Badge className={cn(PRIORITY_COLORS[request.priority])}>
                {priorityLabel(request.priority)}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">{t("adminService.requests.detail.type")}</p>
              <p className="text-sm text-slate-700 dark:text-slate-300">{typeLabel(request.type)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-1">{t("adminService.requests.detail.tenant")}</p>
              <p className="text-sm text-slate-700 dark:text-slate-300">{request.tenant.companyName}</p>
            </div>

            {/* Assignee */}
            {canManage && (
            <div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-1.5">{t("adminService.requests.detail.assignee")}</p>
              <form action={async (fd) => {
                "use server"
                const assigneeId = fd.get("assigneeId") as string
                await updateRequestStatus(id, request.status, assigneeId || undefined)
              }}>
                <select name="assigneeId" defaultValue={request.assigneeId ?? ""}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 px-2 py-1.5 text-xs bg-white dark:bg-slate-900 focus:border-blue-500 focus:outline-none">
                  <option value="">{t("adminService.requests.detail.unassigned")}</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <Button type="submit" variant="outline" size="sm" className="mt-1.5 w-full">
                  {t("adminService.requests.detail.assign")}
                </Button>
              </form>
            </div>
            )}
          </Card>

          {/* Status transitions */}
          {canManage && nextStatuses.length > 0 && (
            <Card className="block p-4 space-y-2">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{t("adminService.requests.detail.changeStatus")}</p>
              {nextStatuses.map((s) => (
                <form key={s} action={async () => {
                  "use server"
                  await updateRequestStatus(id, s)
                }}>
                  <button type="submit"
                    className={cn("w-full rounded-lg py-2 text-xs font-medium transition-colors", statusBtnColor[s])}>
                    {statusLabel(s)}
                  </button>
                </form>
              ))}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
