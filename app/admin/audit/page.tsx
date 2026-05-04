export const dynamic = "force-dynamic"

import Link from "next/link"
import { AlertTriangle, Edit2, History, LogIn, PlusCircle, ShieldAlert, Trash2, User } from "lucide-react"
import type { Prisma } from "@/app/generated/prisma/client"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { db } from "@/lib/db"
import { requireOwner } from "@/lib/permissions"
import { requireOrgAccess } from "@/lib/org"
import { auditLogScope } from "@/lib/tenant-scope"
import { cn } from "@/lib/utils"
import { DEFAULT_PAGE_SIZE, normalizePage, pageSkip } from "@/lib/pagination"

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  UPDATE: "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300",
  DELETE: "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300",
  LOGIN: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
  LOGOUT: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
  ERROR: "bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300",
  SECURITY: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300",
}

const ACTION_ICONS: Record<string, React.ElementType> = {
  CREATE: PlusCircle,
  UPDATE: Edit2,
  DELETE: Trash2,
  LOGIN: LogIn,
  LOGOUT: LogIn,
  ERROR: AlertTriangle,
  SECURITY: ShieldAlert,
}

const ENTITY_LABELS: Record<string, string> = {
  tenant: "Арендатор",
  building: "Здание",
  floor: "Этаж",
  space: "Помещение",
  charge: "Начисление",
  payment: "Платёж",
  expense: "Расход",
  user: "Пользователь",
  contract: "Договор",
  lead: "Лид",
  tariff: "Тариф",
  meter: "Счётчик",
  request: "Заявка",
  task: "Задача",
  system: "Система",
  apiKey: "API-ключ",
}

const AUDIT_FILTERS = [
  { key: "all", label: "Все", action: null },
  { key: "delete", label: "Удаления", action: "DELETE" },
  { key: "security", label: "Безопасность", action: "SECURITY" },
  { key: "error", label: "Ошибки", action: "ERROR" },
  { key: "login", label: "Входы", action: "LOGIN" },
] as const

type AuditFilterKey = (typeof AUDIT_FILTERS)[number]["key"]

function normalizeFilter(value: string | string[] | undefined): AuditFilterKey {
  const raw = Array.isArray(value) ? value[0] : value
  return AUDIT_FILTERS.some((filter) => filter.key === raw) ? raw as AuditFilterKey : "all"
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams?: Promise<{ type?: string | string[]; page?: string | string[] }>
}) {
  await requireOwner()
  const { orgId } = await requireOrgAccess()
  const resolvedSearchParams = await searchParams
  const selectedFilter = normalizeFilter(resolvedSearchParams?.type)
  const page = normalizePage(resolvedSearchParams?.page)
  const selectedConfig = AUDIT_FILTERS.find((filter) => filter.key === selectedFilter) ?? AUDIT_FILTERS[0]
  const baseWhere = await auditLogScope(orgId) as Prisma.AuditLogWhereInput
  const logsWhere: Prisma.AuditLogWhereInput = selectedConfig.action
    ? { AND: [baseWhere, { action: selectedConfig.action }] }
    : baseWhere

  const [logs, totalLogs, totalAllLogs, actionGroups] = await Promise.all([
    db.auditLog.findMany({
      where: logsWhere,
      orderBy: { createdAt: "desc" },
      skip: pageSkip(page),
      take: DEFAULT_PAGE_SIZE,
    }),
    db.auditLog.count({ where: logsWhere }),
    db.auditLog.count({ where: baseWhere }),
    db.auditLog.groupBy({
      by: ["action"],
      where: baseWhere,
      _count: { _all: true },
    }),
  ])
  const countByAction = new Map(actionGroups.map((group) => [group.action, group._count._all]))
  const filterCounts = AUDIT_FILTERS.reduce<Record<AuditFilterKey, number>>((acc, filter) => {
    acc[filter.key] = filter.action ? countByAction.get(filter.action) ?? 0 : totalAllLogs
    return acc
  }, { all: 0, delete: 0, security: 0, error: 0, login: 0 })

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-500/10">
          <History className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Журнал операций</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Найдено {totalLogs} из {totalAllLogs} действий пользователей
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <AuditSummary label="Всего" value={totalAllLogs} tone="slate" />
        <AuditSummary label="Удаления" value={filterCounts.delete} tone="red" />
        <AuditSummary label="Безопасность" value={filterCounts.security} tone="amber" />
        <AuditSummary label="Ошибки" value={filterCounts.error} tone="red" />
      </div>

      <div className="flex flex-wrap gap-2">
        {AUDIT_FILTERS.map((filter) => {
          const active = selectedFilter === filter.key
          return (
            <Link
              key={filter.key}
              href={filter.key === "all" ? "/admin/audit" : `/admin/audit?type=${filter.key}`}
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
          )
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {logs.length === 0 ? (
          <div className="py-16 text-center">
            <History className="mx-auto mb-3 h-10 w-10 text-slate-200" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Записей не найдено</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Выберите другой фильтр или проверьте, что действия логируются через audit helper.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Время</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Пользователь</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Действие</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Объект</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">ID объекта</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Детали</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const Icon = ACTION_ICONS[log.action] ?? History
                return (
                  <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                      {new Date(log.createdAt).toLocaleString("ru-RU", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2.5">
                      {log.userName ? (
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3 text-slate-400" />
                          <span className="font-medium text-slate-900 dark:text-slate-100">{log.userName}</span>
                          {log.userRole && <span className="text-[10px] text-slate-400">({log.userRole})</span>}
                        </div>
                      ) : (
                        <span className="text-slate-400">Система</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", ACTION_COLORS[log.action])}>
                        <Icon className="h-3 w-3" />
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{ENTITY_LABELS[log.entity] ?? log.entity}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{log.entityId?.slice(0, 12) ?? "—"}</td>
                    <td className="max-w-xs px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">{summarizeDetails(log.details)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{log.ip ?? "—"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <PaginationControls
          basePath="/admin/audit"
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          total={totalLogs}
          params={{ type: selectedFilter }}
        />
      </div>
    </div>
  )
}

function AuditSummary({ label, value, tone }: { label: string; value: number; tone: "slate" | "red" | "amber" }) {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100",
    red: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
    amber: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  }

  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs opacity-80">{label}</p>
    </div>
  )
}

function summarizeDetails(details: string | null) {
  if (!details) return "—"
  try {
    const parsed = JSON.parse(details) as Record<string, unknown>
    const keys = ["errorId", "source", "path", "name", "status", "amount", "period"]
    const values = keys
      .map((key) => {
        const value = parsed[key]
        return typeof value === "string" || typeof value === "number" ? `${key}: ${value}` : null
      })
      .filter(Boolean)
    if (values.length > 0) return values.join(" · ")
  } catch {
    // Raw details can be legacy text, keep a short preview.
  }

  return details.length > 90 ? `${details.slice(0, 90)}...` : details
}
