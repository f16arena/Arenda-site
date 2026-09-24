export const dynamic = "force-dynamic"

import Link from "next/link"
import { AlertTriangle, Bug, CheckCircle2, Download, ExternalLink, Search, ServerCrash, ShieldAlert } from "lucide-react"
import { updateErrorSupportStatus, type ErrorSupportStatus } from "@/app/actions/superadmin-errors"
import { BulkResolveButton } from "./bulk-resolve-button"
import type { Prisma } from "@/app/generated/prisma/client"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { db } from "@/lib/db"
import { decodeErrorReport, humanizeErrorReport, parseErrorDetails, type ErrorReportDetails } from "@/lib/error-report"
import { INTL_LOCALE, type Locale } from "@/lib/i18n/config"
import type { Messages } from "@/lib/i18n/messages"
import { getLocale, getT } from "@/lib/i18n/server"
import type { Translator } from "@/lib/i18n/translate"
import { requirePlatformOwner } from "@/lib/org"
import { normalizePage, pageSkip } from "@/lib/pagination"
import { safeServerValue } from "@/lib/server-fallback"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 30

/** Переводчик страницы: синхронные помощники получают его параметром. */
type PageTranslator = Translator<Messages>["t"]

type SupportFilter = "open" | "new" | "in_progress" | "resolved" | "all"

export default async function SuperadminErrorsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string | string[]; q?: string | string[]; kind?: string | string[]; status?: string | string[] }>
}) {
  const { userId } = await requirePlatformOwner()
  const locale = await getLocale()
  const { t, tp } = await getT(locale)
  const resolved = await searchParams
  const page = normalizePage(resolved?.page)
  const query = normalizeQuery(resolved?.q)
  const kind = normalizeKind(resolved?.kind)
  const supportFilter = normalizeSupportFilter(resolved?.status)
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/superadmin/errors", userId })

  const filters: Prisma.AuditLogWhereInput[] = [supportFilterWhere(supportFilter)]
  if (kind) filters.push({ details: { contains: `"routeKind":"${kind}"`, mode: "insensitive" } })
  if (query) {
    filters.push({
      OR: [
        { entityId: { contains: query, mode: "insensitive" } },
        { details: { contains: query, mode: "insensitive" } },
        { userName: { contains: query, mode: "insensitive" } },
        { userRole: { contains: query, mode: "insensitive" } },
        { ip: { contains: query, mode: "insensitive" } },
      ],
    })
  }

  const where: Prisma.AuditLogWhereInput = {
    action: "ERROR",
    ...(filters.length > 0 ? { AND: filters } : {}),
  }

  const now = new Date()
  const last24 = new Date(now.getTime() - 24 * 3600 * 1000)
  const openWhere = { action: "ERROR", ...supportFilterWhere("open") } satisfies Prisma.AuditLogWhereInput
  const inProgressWhere = { action: "ERROR", ...supportFilterWhere("in_progress") } satisfies Prisma.AuditLogWhereInput
  const resolvedWhere = { action: "ERROR", ...supportFilterWhere("resolved") } satisfies Prisma.AuditLogWhereInput

  const [logs, total, totalAll, openCount, inProgressCount, resolvedCount, last24Count] = await Promise.all([
    safe(
      "superadmin.errors.logs",
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: pageSkip(page, PAGE_SIZE),
        take: PAGE_SIZE,
      }),
      [],
    ),
    safe("superadmin.errors.total", db.auditLog.count({ where }), 0),
    safe("superadmin.errors.totalAll", db.auditLog.count({ where: { action: "ERROR" } }), 0),
    safe("superadmin.errors.openCount", db.auditLog.count({ where: openWhere }), 0),
    safe("superadmin.errors.inProgressCount", db.auditLog.count({ where: inProgressWhere }), 0),
    safe("superadmin.errors.resolvedCount", db.auditLog.count({ where: resolvedWhere }), 0),
    safe("superadmin.errors.last24Count", db.auditLog.count({ where: { action: "ERROR", createdAt: { gte: last24 } } }), 0),
  ])

  const parsed = logs.map((log) => ({ log, details: parseErrorDetails(log.details) }))
  const orgIds = Array.from(new Set(parsed.map((item) => item.details.organizationId).filter(Boolean) as string[]))
  const orgs = orgIds.length > 0
    ? await safe(
        "superadmin.errors.organizations",
        db.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true, slug: true },
        }),
        [],
      )
    : []
  const orgMap = new Map(orgs.map((org) => [org.id, org]))

  const serverComponentCount = parsed.filter((item) => {
    const details = item.details
    const text = `${details.message ?? ""} ${details.digest ?? ""} ${details.source ?? ""}`.toLowerCase()
    return text.includes("server components render") || (!!details.digest && `${details.source ?? ""}`.includes("/error"))
  }).length
  const repeatMap = getRepeatMap(parsed.map(({ log, details }) => details.errorId ?? log.entityId ?? log.id))

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 dark:bg-red-500/10">
            <Bug className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t("superadmin.errors.title")}</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {t("superadmin.errors.subtitle")}
            </p>
          </div>
        </div>

        <form action="/superadmin/errors" className="flex w-full gap-2 lg:w-[680px]">
          <input type="hidden" name="status" value={supportFilter} />
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              name="q"
              defaultValue={query}
              placeholder={t("superadmin.errors.searchPlaceholder")}
              className="pl-9"
            />
          </div>
          <select
            name="kind"
            defaultValue={kind}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-purple-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <option value="">{t("superadmin.errors.zoneAll")}</option>
            <option value="admin">{t("superadmin.errors.zoneOptions.admin")}</option>
            <option value="cabinet">{t("superadmin.errors.zoneOptions.cabinet")}</option>
            <option value="superadmin">{t("superadmin.errors.zoneOptions.superadmin")}</option>
            <option value="public">{t("superadmin.errors.zoneOptions.public")}</option>
            <option value="server-action">{t("superadmin.errors.zoneOptions.serverAction")}</option>
            <option value="server">{t("superadmin.errors.zoneOptions.server")}</option>
          </select>
          <button className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700">
            {t("common.actions.search")}
          </button>
          <a
            href="/superadmin/errors/export"
            title={t("superadmin.errors.downloadJson")}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/50"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">{t("superadmin.errors.jsonCount", { count: totalAll })}</span>
          </a>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={ShieldAlert} label={t("superadmin.errors.statOpen")} value={openCount} tone="red" />
        <StatCard icon={AlertTriangle} label={t("superadmin.errors.stat24h")} value={last24Count} tone="amber" />
        <StatCard icon={ServerCrash} label={t("superadmin.errors.statServerComponent")} value={serverComponentCount} tone="purple" />
        <StatCard icon={CheckCircle2} label={t("superadmin.errors.statResolved")} value={resolvedCount} tone="emerald" />
      </div>

      <div className="flex flex-wrap gap-2">
        <StatusLink label={t("superadmin.errors.filterOpen")} value="open" active={supportFilter === "open"} count={openCount} q={query} kind={kind} />
        <StatusLink label={t("superadmin.errors.filterNew")} value="new" active={supportFilter === "new"} count={Math.max(openCount - inProgressCount, 0)} q={query} kind={kind} />
        <StatusLink label={t("superadmin.errors.filterInProgress")} value="in_progress" active={supportFilter === "in_progress"} count={inProgressCount} q={query} kind={kind} />
        <StatusLink label={t("superadmin.errors.filterResolved")} value="resolved" active={supportFilter === "resolved"} count={resolvedCount} q={query} kind={kind} />
        <StatusLink label={t("superadmin.errors.filterAll")} value="all" active={supportFilter === "all"} count={totalAll} q={query} kind={kind} />
        <div className="ml-auto">
          <BulkResolveButton openCount={openCount} />
        </div>
      </div>

      <Card className="block p-0">
        {parsed.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Bug className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("superadmin.errors.emptyTitle")}</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{t("superadmin.errors.emptyHint")}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {parsed.map(({ log, details }) => {
              const decoded = decodeErrorReport(details)
              const human = humanizeErrorReport(t, details)
              const org = details.organizationId ? orgMap.get(details.organizationId) : null
              const errorCode = details.errorId ?? log.entityId ?? log.id
              const supportStatus = getSupportStatus(details)
              const repeatCount = repeatMap.get(errorCode) ?? 1

              return (
                <article key={log.id} className={cn("p-5", supportStatus === "RESOLVED" && "bg-emerald-50/40 dark:bg-emerald-500/5")}>
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <SupportStatusBadge status={supportStatus} t={t} />
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[11px] font-semibold",
                            decoded.severity === "critical"
                              ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                              : decoded.severity === "warning"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                          )}
                        >
                          {severityLabel(t, decoded.severity)}
                        </Badge>
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{human.title}</h2>
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">#{errorCode}</span>
                        {repeatCount > 1 && (
                          <Badge variant="secondary" className="bg-slate-100 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {tp("superadmin.errors.repeats", repeatCount)}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {formatDateTime(locale, log.createdAt)} · {routeKindLabel(t, details.routeKind)} ·{" "}
                        {org ? `${org.name} (${org.slug})` : t("superadmin.errors.platformZone")}
                      </p>
                      {details.supportNote && (
                        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
                          {t("superadmin.errors.supportNote", { note: details.supportNote })}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {details.href && (
                        <a
                          href={details.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50"
                        >
                          {t("superadmin.errors.openPage")} <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      <Link
                        href={`/superadmin/audit?q=${encodeURIComponent(errorCode)}`}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50"
                      >
                        {t("superadmin.errors.toAudit")}
                      </Link>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    <InfoBox title={t("superadmin.errors.boxProblem")} text={human.problem} />
                    <InfoBox title={t("superadmin.errors.boxCause")} text={human.cause} />
                    <InfoBox title={t("superadmin.errors.boxAction")} text={human.action} />
                    <InfoBox title={t("superadmin.errors.boxImpact")} text={human.impact} />
                  </div>

                  <dl className="mt-4 grid gap-3 text-xs md:grid-cols-2 xl:grid-cols-5">
                    <Field label={t("superadmin.errors.fieldPage")} value={details.path ?? t("superadmin.errors.emptyValue")} mono />
                    <Field label={t("superadmin.errors.fieldKind")} value={human.technicalKind} />
                    <Field
                      label={t("superadmin.errors.fieldDigest")}
                      value={details.sentryEventId ?? details.digest ?? t("superadmin.errors.emptyValue")}
                      mono
                    />
                    <Field
                      label={t("superadmin.errors.fieldUser")}
                      value={`${log.userName ?? t("superadmin.errors.systemUser")}${log.userRole ? ` (${log.userRole})` : ""}`}
                    />
                    <Field
                      label={t("superadmin.errors.fieldIpHost")}
                      value={`${log.ip ?? t("superadmin.errors.emptyValue")} · ${details.host ?? t("superadmin.errors.emptyValue")}`}
                      mono
                    />
                  </dl>

                  {mergedHints(details.hints, decoded.hints).length > 0 && (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-500 dark:text-slate-400">
                      {mergedHints(details.hints, decoded.hints).map((hint) => <li key={hint}>{hint}</li>)}
                    </ul>
                  )}

                  <SupportActions logId={log.id} status={supportStatus} note={details.supportNote ?? ""} t={t} />
                  <DeveloperDetails details={details} t={t} />
                </article>
              )
            })}
          </div>
        )}

        <PaginationControls
          basePath="/superadmin/errors"
          params={{ q: query, kind, status: supportFilter === "open" ? null : supportFilter }}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
        />
      </Card>
    </div>
  )
}

function supportFilterWhere(filter: SupportFilter): Prisma.AuditLogWhereInput {
  if (filter === "all") return {}
  if (filter === "resolved") return { details: { contains: `"supportStatus":"RESOLVED"` } }
  if (filter === "in_progress") return { details: { contains: `"supportStatus":"IN_PROGRESS"` } }
  if (filter === "new") {
    return {
      NOT: [
        { details: { contains: `"supportStatus":"IN_PROGRESS"` } },
        { details: { contains: `"supportStatus":"RESOLVED"` } },
      ],
    }
  }
  return { NOT: [{ details: { contains: `"supportStatus":"RESOLVED"` } }] }
}

function normalizeQuery(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value
  return (raw ?? "").trim().slice(0, 120)
}

function normalizeKind(value: string | string[] | undefined): string {
  const raw = (Array.isArray(value) ? value[0] : value ?? "").trim()
  return ["admin", "cabinet", "superadmin", "public", "server-action", "server"].includes(raw) ? raw : ""
}

function normalizeSupportFilter(value: string | string[] | undefined): SupportFilter {
  const raw = (Array.isArray(value) ? value[0] : value ?? "").trim().toLowerCase()
  return raw === "all" || raw === "new" || raw === "in_progress" || raw === "resolved" ? raw : "open"
}

function getSupportStatus(details: ErrorReportDetails): ErrorSupportStatus {
  return details.supportStatus === "IN_PROGRESS" || details.supportStatus === "RESOLVED" ? details.supportStatus : "NEW"
}

function getRepeatMap(keys: string[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const key of keys) map.set(key, (map.get(key) ?? 0) + 1)
  return map
}

function severityLabel(t: PageTranslator, severity: "critical" | "warning" | "info"): string {
  if (severity === "critical") return t("superadmin.errors.severityCritical")
  if (severity === "warning") return t("superadmin.errors.severityWarning")
  return t("superadmin.errors.severityInfo")
}

function routeKindLabel(t: PageTranslator, kind: string | null | undefined): string {
  if (!kind) return t("superadmin.errors.zoneUnknown")
  // Ключи словаря в camelCase, а routeKind приходит через дефис: server-action.
  const name = kind.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
  const key = `superadmin.errors.zones.${name}` as Parameters<typeof t>[0]
  const label = t(key)
  // Незнакомую зону показываем её кодом, а не ключом словаря.
  return label === key ? kind : label
}

function mergedHints(...groups: Array<string[] | undefined>): string[] {
  return Array.from(new Set(groups.flatMap((group) => group ?? []).filter(Boolean)))
}

function formatDateTime(locale: Locale, value: Date): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Qyzylorda",
  }).format(value)
}

function StatusLink({
  label,
  value,
  active,
  count,
  q,
  kind,
}: {
  label: string
  value: SupportFilter
  active: boolean
  count: number
  q: string
  kind: string
}) {
  const params = new URLSearchParams()
  if (q) params.set("q", q)
  if (kind) params.set("kind", kind)
  if (value !== "open") params.set("status", value)
  const href = params.toString() ? `/superadmin/errors?${params}` : "/superadmin/errors"

  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
        active
          ? "border-purple-600 bg-purple-600 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/50",
      )}
    >
      {label}
      <span className={cn("ml-1.5 text-[10px]", active ? "text-purple-100" : "text-slate-400 dark:text-slate-500")}>{count}</span>
    </Link>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType
  label: string
  value: number
  tone: "red" | "amber" | "purple" | "emerald"
}) {
  const tones = {
    red: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-300",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
  }
  return (
    <Card className="block p-4">
      <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </Card>
  )
}

function SupportStatusBadge({ status, t }: { status: ErrorSupportStatus; t: PageTranslator }) {
  const config = {
    NEW: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    IN_PROGRESS: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    RESOLVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  }
  return (
    <Badge variant="secondary" className={cn("text-[11px] font-semibold", config[status])}>
      {status === "NEW"
        ? t("superadmin.errors.statusNew")
        : status === "IN_PROGRESS"
          ? t("superadmin.errors.statusInProgress")
          : t("superadmin.errors.statusResolved")}
    </Badge>
  )
}

function SupportActions({
  logId,
  status,
  note,
  t,
}: {
  logId: string
  status: ErrorSupportStatus
  note: string
  t: PageTranslator
}) {
  return (
    <form action={updateErrorSupportStatus} className="mt-4 rounded-lg border border-slate-100 p-3 dark:border-slate-800">
      <input type="hidden" name="logId" value={logId} />
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <Input
          name="note"
          defaultValue={note}
          placeholder={t("superadmin.errors.notePlaceholder")}
          className="min-w-0 flex-1 text-xs"
        />
        <div className="flex flex-wrap gap-2">
          {status !== "IN_PROGRESS" && (
            <button
              name="status"
              value="IN_PROGRESS"
              className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/10"
            >
              {t("superadmin.errors.toWork")}
            </button>
          )}
          {status !== "RESOLVED" && (
            <button
              name="status"
              value="RESOLVED"
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
            >
              {t("superadmin.errors.markResolved")}
            </button>
          )}
          {status !== "NEW" && (
            <button
              name="status"
              value="NEW"
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50"
            >
              {t("superadmin.errors.reopen")}
            </button>
          )}
        </div>
      </div>
    </form>
  )
}

function InfoBox({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
      <p className="text-[11px] font-semibold uppercase text-slate-400 dark:text-slate-500">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300">{text}</p>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-100 p-3 dark:border-slate-800">
      <dt className="text-[11px] text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className={cn("mt-1 truncate text-slate-700 dark:text-slate-300", mono && "font-mono")}>{value}</dd>
    </div>
  )
}

function DeveloperDetails({ details, t }: { details: ErrorReportDetails; t: PageTranslator }) {
  if (!details.context && !details.message && !details.stack) return null
  const technicalBrief = getTechnicalBrief(t, details)

  return (
    <details className="mt-4 rounded-lg border border-slate-100 p-3 text-xs dark:border-slate-800">
      <summary className="cursor-pointer font-medium text-slate-600 dark:text-slate-300">
        {t("superadmin.errors.devDetails")}
      </summary>
      <div className="mt-3 space-y-3">
        <TechnicalBriefView brief={technicalBrief} />
        {details.context && <ContextPreview context={details.context} t={t} />}
        {details.message && <RawBlock title={t("superadmin.errors.rawMessage")} value={details.message} />}
        {details.stack && <RawBlock title={t("superadmin.errors.rawStack")} value={details.stack} />}
        {details.context && (
          <details className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
            <summary className="cursor-pointer text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {t("superadmin.errors.fullJson")}
            </summary>
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[11px] text-slate-100">
              {JSON.stringify(details.context, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </details>
  )
}

type TechnicalBrief = {
  title: string
  summary: string
  checklist: string[]
}

function getTechnicalBrief(t: PageTranslator, details: ErrorReportDetails): TechnicalBrief {
  const source = details.source ?? ""
  const path = details.path ?? ""
  const message = details.message ?? ""
  const stack = details.stack ?? ""
  const text = `${source}\n${path}\n${message}\n${stack}\n${details.digest ?? ""}`.toLowerCase()

  // Слова ниже — распознавание типа ошибки, а не интерфейс: их не переводим.
  const kind: "hydration" | "serverComponent" | "database" | "serverAction" | "unknown" =
    text.includes("minified react error #418") || text.includes("react.dev/errors/418")
      ? "hydration"
      : text.includes("server components render") || (details.digest && source.includes("/error"))
        ? "serverComponent"
        : text.includes("prisma") || text.includes("unique constraint") || text.includes("foreign key constraint")
          ? "database"
          : text.includes("server-action") || (source.includes(".") && !source.includes("/"))
            ? "serverAction"
            : "unknown"

  return {
    title: t(`superadmin.brief.${kind}.title`),
    summary: t(`superadmin.brief.${kind}.summary`),
    checklist: [
      t(`superadmin.brief.${kind}.c1`),
      t(`superadmin.brief.${kind}.c2`),
      t(`superadmin.brief.${kind}.c3`),
    ],
  }
}

function TechnicalBriefView({ brief }: { brief: TechnicalBrief }) {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 dark:border-blue-500/20 dark:bg-blue-500/10">
      <p className="text-xs font-semibold text-blue-900 dark:text-blue-200">{brief.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-blue-800 dark:text-blue-200/80">{brief.summary}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-blue-800 dark:text-blue-200/80">
        {brief.checklist.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  )
}

function ContextPreview({ context, t }: { context: Record<string, unknown>; t: PageTranslator }) {
  const entries = Object.entries(context).slice(0, 8)
  if (entries.length === 0) return <p className="text-slate-500 dark:text-slate-400">{t("superadmin.errors.emptyContext")}</p>

  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
          <dt className="text-[11px] text-slate-400 dark:text-slate-500">{contextKeyLabel(t, key)}</dt>
          <dd className="mt-1 break-words text-slate-700 dark:text-slate-300">{formatContextValue(t, value)}</dd>
        </div>
      ))}
    </dl>
  )
}

function RawBlock({ title, value }: { title: string; value: string }) {
  return (
    <details className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
      <summary className="cursor-pointer text-[11px] font-medium text-slate-500 dark:text-slate-400">{title}</summary>
      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[11px] text-slate-100">
        {value}
      </pre>
    </details>
  )
}

function contextKeyLabel(t: PageTranslator, key: string): string {
  const dictKey = `superadmin.errors.contextKeys.${key}` as Parameters<typeof t>[0]
  const label = t(dictKey)
  // Незнакомое поле контекста показываем его техническим именем.
  return label === dictKey ? key : label
}

function formatContextValue(t: PageTranslator, value: unknown): string {
  if (value === null || value === undefined || value === "") return t("superadmin.errors.emptyValue")
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) {
    return value.length === 0
      ? t("superadmin.errors.emptyList")
      : t("superadmin.errors.listOf", { count: value.length })
  }
  if (typeof value === "object") {
    return t("superadmin.errors.objectOf", { count: Object.keys(value as Record<string, unknown>).length })
  }
  return String(value)
}
