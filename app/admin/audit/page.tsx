export const dynamic = "force-dynamic"

import Link from "next/link"
import { AlertTriangle, Edit2, History, LogIn, PlusCircle, ShieldAlert, Trash2 } from "lucide-react"
import type { Prisma } from "@/app/generated/prisma/client"
import { RouteTabs } from "@/components/ui/route-tabs"
import { historyTabs } from "@/lib/hub-tabs"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { db } from "@/lib/db"
import { requireOwner } from "@/lib/permissions"
import { requireOrgAccess } from "@/lib/org"
import { auditLogScope } from "@/lib/tenant-scope"
import { cn } from "@/lib/utils"
import { DEFAULT_PAGE_SIZE, normalizePage, pageSkip } from "@/lib/pagination"
import { Card } from "@/components/ui/page"
import { auditSentence, auditTrace, auditWhen } from "@/lib/audit-humanize"
import { getT } from "@/lib/i18n/server"

/**
 * История действий. Раньше это была таблица с колонками «DELETE»,
 * «cmq9pos9s000» и сырым JSON — читать её мог только программист. Теперь одна
 * строка = одна фраза: «Болат удалил арендатора „Satory Company“ — вчера в
 * 18:54», а коды и IP ушли во вторую, серую строку.
 */

const ACTION_STYLE: Record<string, { icon: React.ElementType; className: string }> = {
  CREATE: { icon: PlusCircle, className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  UPDATE: { icon: Edit2, className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  DELETE: { icon: Trash2, className: "bg-red-500/10 text-red-600 dark:text-red-400" },
  LOGIN: { icon: LogIn, className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
  LOGOUT: { icon: LogIn, className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
  ERROR: { icon: AlertTriangle, className: "bg-red-500/10 text-red-600 dark:text-red-400" },
  SECURITY: { icon: ShieldAlert, className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
}

// Подписи фильтров — из словаря по ключу (adminSettings.audit.filters.*).
const AUDIT_FILTERS = [
  { key: "all", action: null },
  { key: "delete", action: "DELETE" },
  { key: "permissions", action: null },
  { key: "login", action: "LOGIN" },
  { key: "error", action: "ERROR" },
  { key: "security", action: "SECURITY" },
] as const

type AuditFilterKey = (typeof AUDIT_FILTERS)[number]["key"]

function normalizeFilter(value: string | string[] | undefined): AuditFilterKey {
  const raw = Array.isArray(value) ? value[0] : value
  return AUDIT_FILTERS.some((filter) => filter.key === raw) ? raw as AuditFilterKey : "all"
}

function permissionAuditWhere(): Prisma.AuditLogWhereInput {
  return {
    entity: "user",
    OR: [
      { details: { contains: "\"scope\":\"role_permission\"" } },
      { details: { contains: "\"scope\":\"role_capability\"" } },
      { details: { contains: "\"scope\":\"user_capability_override\"" } },
      { details: { contains: "\"scope\":\"role\"" } },
    ],
  }
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: Promise<{ type?: string | string[]; page?: string | string[] }>
}) {
  await requireOwner()
  const { orgId } = await requireOrgAccess()
  // Журналу нужен весь переводчик, а не только t: фраза строится из шаблона
  // словаря, а время — по локали (lib/audit-humanize).
  const tr = await getT()
  const { t } = tr
  const resolvedSearchParams = await searchParams
  const selectedFilter = normalizeFilter(resolvedSearchParams?.type)
  const page = normalizePage(resolvedSearchParams?.page)
  const selectedConfig = AUDIT_FILTERS.find((filter) => filter.key === selectedFilter) ?? AUDIT_FILTERS[0]
  const baseWhere = await auditLogScope(orgId) as Prisma.AuditLogWhereInput
  const permissionsWhere = permissionAuditWhere()
  const logsWhere: Prisma.AuditLogWhereInput = selectedFilter === "permissions"
    ? { AND: [baseWhere, permissionsWhere] }
    : selectedConfig.action
      ? { AND: [baseWhere, { action: selectedConfig.action }] }
      : baseWhere

  const [logs, totalLogs, totalAllLogs, actionGroups, permissionsCount] = await Promise.all([
    db.auditLog.findMany({
      where: logsWhere,
      orderBy: { createdAt: "desc" },
      skip: pageSkip(page),
      take: DEFAULT_PAGE_SIZE,
    }),
    db.auditLog.count({ where: logsWhere }),
    db.auditLog.count({ where: baseWhere }),
    db.auditLog.groupBy({ by: ["action"], where: baseWhere, _count: { _all: true } }),
    db.auditLog.count({ where: { AND: [baseWhere, permissionsWhere] } }),
  ])

  const countByAction = new Map(actionGroups.map((group) => [group.action, group._count._all]))
  const filterCounts = AUDIT_FILTERS.reduce<Record<AuditFilterKey, number>>((acc, filter) => {
    acc[filter.key] = filter.key === "permissions"
      ? permissionsCount
      : filter.action ? countByAction.get(filter.action) ?? 0 : totalAllLogs
    return acc
  }, { all: 0, permissions: 0, delete: 0, security: 0, error: 0, login: 0 })

  const now = new Date()

  return (
    <div className="max-w-6xl space-y-5">
      <RouteTabs items={historyTabs(t)} className="mb-2" />

      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t("adminSettings.audit.title")}</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {totalAllLogs === 0
            ? t("adminSettings.audit.emptyHint")
            : t("adminSettings.audit.countHint", { count: totalAllLogs })}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {AUDIT_FILTERS.map((filter) => {
          const active = selectedFilter === filter.key
          return (
            <Link
              key={filter.key}
              href={filter.key === "all" ? "/admin/audit" : `/admin/audit?type=${filter.key}`}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm transition active:scale-[0.97]",
                active
                  ? "border-blue-200 bg-blue-50 font-medium text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50",
              )}
            >
              {t(`adminSettings.audit.filters.${filter.key}`)}
              <span className="ml-2 text-xs text-slate-400">{filterCounts[filter.key]}</span>
            </Link>
          )
        })}
      </div>

      <Card padded={false}>
        {logs.length === 0 ? (
          <div className="py-16 text-center">
            <History className="mx-auto mb-3 h-10 w-10 text-slate-200 dark:text-slate-700" />
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("adminSettings.audit.empty")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {logs.map((log) => {
              const style = ACTION_STYLE[log.action] ?? { icon: History, className: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" }
              const Icon = style.icon
              const trace = auditTrace(log, tr)
              return (
                <li key={log.id} className="flex items-start gap-3 px-4 py-3">
                  <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", style.className)}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-900 dark:text-slate-100">{auditSentence(log, tr)}</p>
                    {trace && <p className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">{trace}</p>}
                  </div>
                  <span className="shrink-0 whitespace-nowrap text-xs text-slate-400 dark:text-slate-500">
                    {auditWhen(log.createdAt, tr, now)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
        <PaginationControls
          basePath="/admin/audit"
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          total={totalLogs}
          params={{ type: selectedFilter }}
        />
      </Card>
    </div>
  )
}
