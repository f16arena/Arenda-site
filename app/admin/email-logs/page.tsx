export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import type { Prisma } from "@/app/generated/prisma/client"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { requireOrgAccess } from "@/lib/org"
import { emailLogScope } from "@/lib/tenant-scope"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { RouteTabs } from "@/components/ui/route-tabs"
import { historyTabs } from "@/lib/hub-tabs"
import { auditWhen } from "@/lib/audit-humanize"
import { normalizePage, pageSkip } from "@/lib/pagination"
import { getT } from "@/lib/i18n/server"
import {
  Mail, CheckCircle, XCircle, Clock, Eye,
} from "lucide-react"
import Link from "next/link"

const PAGE_SIZE = 40

// Виды писем: порядок чипсов-фильтров. Подписи — из словаря
// (adminSettings.emailLogs.types.*), здесь только коды.
const TYPE_KEYS = [
  "INVOICE", "ACT", "CONTRACT", "HANDOVER", "NOTIFICATION",
  "WELCOME", "PASSWORD_RESET", "EMAIL_VERIFY", "EMAIL_CHANGE", "OTHER",
] as const
type TypeKey = (typeof TYPE_KEYS)[number]

// Цвет и иконка статуса; подпись — adminSettings.emailLogs.statuses.*
const STATUS_META = {
  SENT: { color: "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10", icon: CheckCircle },
  OPENED: { color: "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10", icon: Eye },
  QUEUED: { color: "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-500/10", icon: Clock },
  FAILED: { color: "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10", icon: XCircle },
  BOUNCED: { color: "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10", icon: XCircle },
} as const
type StatusKey = keyof typeof STATUS_META

export default async function EmailLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; q?: string; page?: string | string[] }>
}) {
  const session = await auth()
  if (!session || session.user.role === "TENANT") redirect("/login")
  if (session.user.role !== "OWNER" && !session.user.isPlatformOwner) redirect("/admin")
  const { orgId } = await requireOrgAccess()
  // Дата письма форматируется по локали — нужен весь переводчик, не только t.
  const tr = await getT()
  const { t } = tr

  const { status, type, q, page: pageParam } = await searchParams
  const page = normalizePage(pageParam)

  const typeLabel = (value: string) =>
    TYPE_KEYS.includes(value as TypeKey) ? t(`adminSettings.emailLogs.types.${value as TypeKey}`) : value
  const statusKey = (value: string): StatusKey => (value in STATUS_META ? value as StatusKey : "SENT")

  // Спец-фильтр "opened" — все письма, которые были открыты (openedAt != null).
  // Иначе обычный фильтр по полю status.
  const statusFilter: Prisma.EmailLogWhereInput | null =
    status === "opened" ? { openedAt: { not: null } }
    : status ? { status }
    : null

  const where: Prisma.EmailLogWhereInput = {
    AND: [
      await emailLogScope(orgId) as Prisma.EmailLogWhereInput,
      ...(statusFilter ? [statusFilter] : []),
      ...(type ? [{ type }] : []),
      ...(q ? [{
        OR: [
          { recipient: { contains: q, mode: "insensitive" as const } },
          { subject: { contains: q, mode: "insensitive" as const } },
        ],
      }] : []),
    ],
  }
  const [logs, total, sentCount, failedCount, openedCount] = await Promise.all([
    db.emailLog.findMany({
      where,
      orderBy: { sentAt: "desc" },
      skip: pageSkip(page, PAGE_SIZE),
      take: PAGE_SIZE,
      select: {
        id: true, recipient: true, subject: true, type: true, status: true,
        externalId: true, error: true, openedAt: true, openCount: true, sentAt: true,
        tenantId: true,
      },
    }),
    db.emailLog.count({ where }),
    db.emailLog.count({ where: { AND: [where, { status: "SENT" }] } }),
    db.emailLog.count({ where: { AND: [where, { OR: [{ status: "FAILED" }, { status: "BOUNCED" }] }] } }),
    db.emailLog.count({ where: { AND: [where, { openedAt: { not: null } }] } }),
  ])

  return (
    <div className="space-y-5">
      <RouteTabs items={historyTabs(t)} className="mb-2" />

      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t("adminSettings.emailLogs.title")}</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {t("adminSettings.emailLogs.summary", { total, sent: sentCount, opened: openedCount })}
          {failedCount > 0 && <span className="text-red-600 dark:text-red-400">{t("adminSettings.emailLogs.failed", { count: failedCount })}</span>}
        </p>
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap gap-2">
        <FilterChip label={t("adminSettings.emailLogs.filters.all")} href="/admin/email-logs" active={!status && !type} />
        <FilterChip label={t("adminSettings.emailLogs.filters.sent")} href="/admin/email-logs?status=SENT" active={status === "SENT"} />
        <FilterChip label={t("adminSettings.emailLogs.filters.failed")} href="/admin/email-logs?status=FAILED" active={status === "FAILED"} />
        <FilterChip label={t("adminSettings.emailLogs.filters.opened")} href="/admin/email-logs?status=opened" active={status === "opened"} />
        <span className="border-l border-slate-200 dark:border-slate-800 mx-2" />
        {TYPE_KEYS.map((key) => (
          <FilterChip key={key} label={t(`adminSettings.emailLogs.types.${key}`)} href={`/admin/email-logs?type=${key}`} active={type === key} />
        ))}
      </div>

      {/* Список */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-x-auto">
        {logs.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Mail className="h-10 w-10 text-slate-200 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("adminSettings.emailLogs.empty")}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {t("adminSettings.emailLogs.emptyHint")}
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminSettings.emailLogs.columns.when")}</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminSettings.emailLogs.columns.to")}</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminSettings.emailLogs.columns.subject")}</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminSettings.emailLogs.columns.what")}</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminSettings.emailLogs.columns.status")}</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{t("adminSettings.emailLogs.columns.opened")}</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const key = statusKey(log.status)
                const meta = STATUS_META[key]
                const StatusIcon = meta.icon
                return (
                  <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                    <td className="px-5 py-2.5 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {auditWhen(log.sentAt, tr)}
                    </td>
                    <td className="px-5 py-2.5 text-slate-700 dark:text-slate-300 truncate max-w-[200px]">
                      {log.tenantId ? (
                        <Link href={`/admin/tenants/${log.tenantId}`} className="hover:text-blue-600 dark:text-blue-400 hover:underline">
                          {log.recipient}
                        </Link>
                      ) : (
                        log.recipient
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-slate-700 dark:text-slate-300 truncate max-w-[300px]">{log.subject}</td>
                    <td className="px-5 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                      {typeLabel(log.type)}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`}>
                        <StatusIcon className="h-3 w-3" />
                        {t(`adminSettings.emailLogs.statuses.${key}`)}
                      </span>
                      {log.error && (
                        <p className="text-[10px] text-red-500 mt-0.5 truncate max-w-[200px]" title={log.error}>
                          {log.error}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-2.5">
                      {log.openedAt ? (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400" title={t("adminSettings.emailLogs.openedTimes", { count: log.openCount })}>
                          <Eye className="h-3 w-3" />
                          {log.openCount}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <PaginationControls
          basePath="/admin/email-logs"
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          params={{ status, type, q }}
        />
      </div>
    </div>
  )
}

function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active
          ? "bg-slate-900 text-white"
          : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
      }`}
    >
      {label}
    </Link>
  )
}
