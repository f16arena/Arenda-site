export const dynamic = "force-dynamic"

import Link from "next/link"
import { AlertTriangle, Bug, CheckCircle2, ExternalLink, Search, ServerCrash, ShieldAlert } from "lucide-react"
import { updateErrorSupportStatus, type ErrorSupportStatus } from "@/app/actions/superadmin-errors"
import type { Prisma } from "@/app/generated/prisma/client"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { db } from "@/lib/db"
import { decodeErrorReport, humanizeErrorReport, parseErrorDetails, type ErrorReportDetails } from "@/lib/error-report"
import { requirePlatformOwner } from "@/lib/org"
import { normalizePage, pageSkip } from "@/lib/pagination"
import { safeServerValue } from "@/lib/server-fallback"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 30

type SupportFilter = "open" | "new" | "in_progress" | "resolved" | "all"

export default async function SuperadminErrorsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string | string[]; q?: string | string[]; kind?: string | string[]; status?: string | string[] }>
}) {
  const { userId } = await requirePlatformOwner()
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
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Ошибки сайта</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Рабочий журнал поддержки: новые ошибки, ошибки в работе и уже решенные события не смешиваются.
            </p>
          </div>
        </div>

        <form action="/superadmin/errors" className="flex w-full gap-2 lg:w-[680px]">
          <input type="hidden" name="status" value={supportFilter} />
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={query}
              placeholder="Код, страница, пользователь, IP..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-purple-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <select
            name="kind"
            defaultValue={kind}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-purple-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <option value="">Все зоны</option>
            <option value="admin">Админка</option>
            <option value="cabinet">Кабинет арендатора</option>
            <option value="superadmin">Суперпользователь</option>
            <option value="public">Публичный сайт</option>
            <option value="server-action">Действия на сервере</option>
            <option value="server">Сервер</option>
          </select>
          <button className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700">
            Найти
          </button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={ShieldAlert} label="Открытых" value={openCount} tone="red" />
        <StatCard icon={AlertTriangle} label="За 24 часа" value={last24Count} tone="amber" />
        <StatCard icon={ServerCrash} label="Server Component" value={serverComponentCount} tone="purple" />
        <StatCard icon={CheckCircle2} label="Решено" value={resolvedCount} tone="emerald" />
      </div>

      <div className="flex flex-wrap gap-2">
        <StatusLink label="Открытые" value="open" active={supportFilter === "open"} count={openCount} q={query} kind={kind} />
        <StatusLink label="Новые" value="new" active={supportFilter === "new"} count={Math.max(openCount - inProgressCount, 0)} q={query} kind={kind} />
        <StatusLink label="В работе" value="in_progress" active={supportFilter === "in_progress"} count={inProgressCount} q={query} kind={kind} />
        <StatusLink label="Решенные" value="resolved" active={supportFilter === "resolved"} count={resolvedCount} q={query} kind={kind} />
        <StatusLink label="Все" value="all" active={supportFilter === "all"} count={totalAll} q={query} kind={kind} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {parsed.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Bug className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Ошибок не найдено</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Попробуйте изменить поиск, зону или статус.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {parsed.map(({ log, details }) => {
              const decoded = decodeErrorReport(details)
              const human = humanizeErrorReport(details)
              const org = details.organizationId ? orgMap.get(details.organizationId) : null
              const errorCode = details.errorId ?? log.entityId ?? log.id
              const supportStatus = getSupportStatus(details)
              const repeatCount = repeatMap.get(errorCode) ?? 1

              return (
                <article key={log.id} className={cn("p-5", supportStatus === "RESOLVED" && "bg-emerald-50/40 dark:bg-emerald-500/5")}>
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <SupportStatusBadge status={supportStatus} />
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            decoded.severity === "critical"
                              ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                              : decoded.severity === "warning"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                          )}
                        >
                          {severityLabel(decoded.severity)}
                        </span>
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{human.title}</h2>
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">#{errorCode}</span>
                        {repeatCount > 1 && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {repeatCount} похожих на странице
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {formatDateTime(log.createdAt)} · {routeKindLabel(details.routeKind)} ·{" "}
                        {org ? `${org.name} (${org.slug})` : "платформа / публичная зона"}
                      </p>
                      {details.supportNote && (
                        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
                          Заметка поддержки: {details.supportNote}
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
                          Открыть страницу <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      <Link
                        href={`/superadmin/audit?q=${encodeURIComponent(errorCode)}`}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50"
                      >
                        В audit
                      </Link>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    <InfoBox title="Что произошло" text={human.problem} />
                    <InfoBox title="Вероятная причина" text={human.cause} />
                    <InfoBox title="Что сделать" text={human.action} />
                    <InfoBox title="Влияние" text={human.impact} />
                  </div>

                  <dl className="mt-4 grid gap-3 text-xs md:grid-cols-2 xl:grid-cols-5">
                    <Field label="Страница" value={details.path ?? "—"} mono />
                    <Field label="Тип ошибки" value={human.technicalKind} />
                    <Field label="Код Next/Sentry" value={details.sentryEventId ?? details.digest ?? "—"} mono />
                    <Field label="Пользователь" value={`${log.userName ?? "Система"}${log.userRole ? ` (${log.userRole})` : ""}`} />
                    <Field label="IP / Host" value={`${log.ip ?? "—"} · ${details.host ?? "—"}`} mono />
                  </dl>

                  {mergedHints(details.hints, decoded.hints).length > 0 && (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-500 dark:text-slate-400">
                      {mergedHints(details.hints, decoded.hints).map((hint) => <li key={hint}>{hint}</li>)}
                    </ul>
                  )}

                  <SupportActions logId={log.id} status={supportStatus} note={details.supportNote ?? ""} />
                  <DeveloperDetails details={details} />
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
      </div>
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

function severityLabel(severity: "critical" | "warning" | "info"): string {
  if (severity === "critical") return "Критично"
  if (severity === "warning") return "Внимание"
  return "Инфо"
}

function routeKindLabel(kind: string | null | undefined): string {
  const labels: Record<string, string> = {
    admin: "админка",
    cabinet: "кабинет арендатора",
    superadmin: "суперпользователь",
    public: "публичный сайт",
    "server-action": "действие на сервере",
    server: "сервер",
  }
  return kind ? labels[kind] ?? kind : "неизвестная зона"
}

function mergedHints(...groups: Array<string[] | undefined>): string[] {
  return Array.from(new Set(groups.flatMap((group) => group ?? []).filter(Boolean)))
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
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
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  )
}

function SupportStatusBadge({ status }: { status: ErrorSupportStatus }) {
  const config = {
    NEW: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
    IN_PROGRESS: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    RESOLVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  }
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", config[status])}>
      {status === "NEW" ? "Новая" : status === "IN_PROGRESS" ? "В работе" : "Решена"}
    </span>
  )
}

function SupportActions({ logId, status, note }: { logId: string; status: ErrorSupportStatus; note: string }) {
  return (
    <form action={updateErrorSupportStatus} className="mt-4 rounded-lg border border-slate-100 p-3 dark:border-slate-800">
      <input type="hidden" name="logId" value={logId} />
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <input
          name="note"
          defaultValue={note}
          placeholder="Заметка поддержки, например: исправлено в 1.3.104"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none focus:border-purple-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
        />
        <div className="flex flex-wrap gap-2">
          {status !== "IN_PROGRESS" && (
            <button
              name="status"
              value="IN_PROGRESS"
              className="rounded-lg border border-amber-200 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-500/30 dark:text-amber-300 dark:hover:bg-amber-500/10"
            >
              В работу
            </button>
          )}
          {status !== "RESOLVED" && (
            <button
              name="status"
              value="RESOLVED"
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700"
            >
              Пометить решенной
            </button>
          )}
          {status !== "NEW" && (
            <button
              name="status"
              value="NEW"
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50"
            >
              Открыть заново
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

function DeveloperDetails({ details }: { details: ErrorReportDetails }) {
  if (!details.context && !details.message && !details.stack) return null
  const technicalBrief = getTechnicalBrief(details)

  return (
    <details className="mt-4 rounded-lg border border-slate-100 p-3 text-xs dark:border-slate-800">
      <summary className="cursor-pointer font-medium text-slate-600 dark:text-slate-300">
        Показать технические детали для разработчика
      </summary>
      <div className="mt-3 space-y-3">
        <TechnicalBriefView brief={technicalBrief} />
        {details.context && <ContextPreview context={details.context} />}
        {details.message && <RawBlock title="Сырой текст ошибки" value={details.message} />}
        {details.stack && <RawBlock title="Сырой stack trace" value={details.stack} />}
        {details.context && (
          <details className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
            <summary className="cursor-pointer text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Показать полный JSON-контекст
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

function getTechnicalBrief(details: ErrorReportDetails): TechnicalBrief {
  const source = details.source ?? ""
  const path = details.path ?? "неизвестная страница"
  const message = details.message ?? ""
  const stack = details.stack ?? ""
  const text = `${source}\n${path}\n${message}\n${stack}\n${details.digest ?? ""}`.toLowerCase()

  if (text.includes("minified react error #418") || text.includes("react.dev/errors/418")) {
    return {
      title: "React #418: браузер и сервер собрали разный HTML",
      summary:
        "Это не ошибка данных в базе, а ошибка отрисовки интерфейса. Обычно она появляется, когда компонент на сервере и в браузере получает разные значения или браузер меняет HTML до гидрации.",
      checklist: [
        "Проверьте компоненты этой страницы на Date.now(), Math.random(), Intl без фиксированного timeZone и чтение window/localStorage до mount.",
        "Проверьте невалидную HTML-разметку: table/tr/td, вложенные ссылки, вложенные формы, интерактивные элементы внутри интерактивных.",
        "Если ошибка видна только у одного пользователя, проверьте расширения браузера и повторите страницу в приватном режиме.",
      ],
    }
  }

  if (text.includes("server components render") || (details.digest && source.includes("/error"))) {
    return {
      title: "Server Component: production скрыл реальную ошибку",
      summary:
        "Next.js не показывает пользователю внутренний текст ошибки. Ищите тот же error id или digest в серверных логах за указанное время.",
      checklist: [
        "Начните со страницы, указанной в карточке, и последних Prisma-запросов этой страницы.",
        "Проверьте, совпадает ли production-база с текущей Prisma-схемой и применены ли миграции.",
        "Проверьте обязательные env-переменные и scope организации/здания/арендатора.",
      ],
    }
  }

  if (text.includes("prisma") || text.includes("unique constraint") || text.includes("foreign key constraint")) {
    return {
      title: "Prisma / Database: запрос не прошел",
      summary:
        "Сервер дошел до базы данных, но запрос отклонен или не совпал с текущей схемой. Сначала смотрите модель, where/select и миграции.",
      checklist: [
        "Если есть Unknown field/Unknown argument, обновите schema.prisma, миграцию и prisma generate.",
        "Если есть unique constraint, проверьте дубликат номера, email, счета, slug или другого уникального поля.",
        "Если есть foreign key constraint, проверьте принадлежность записи текущей организации и здания.",
      ],
    }
  }

  if (text.includes("server-action") || (source.includes(".") && !source.includes("/"))) {
    return {
      title: "Server action: действие формы не завершилось",
      summary:
        "Пользователь нажал кнопку или отправил форму, но серверное действие вернуло ошибку. Нужно проверить входные данные, права и запись в базе.",
      checklist: [
        "Откройте context: там должны быть форма, entity id, организация и пользователь.",
        "Если это ошибка валидации, исправьте текст прямо в форме, чтобы пользователь понял, что поменять.",
        "Если это ошибка доступа, проверьте server-side permission и building scope.",
      ],
    }
  }

  return {
    title: "Техническая сводка",
    summary:
      "Автоматическая классификация не нашла узкий тип ошибки. Начните со страницы, пользователя, времени события и stack trace.",
    checklist: [
      "Повторите действие пользователя на той же странице.",
      "Сравните время события с последними релизами и серверными логами.",
      "Если ошибка повторяется, добавьте более точный лог контекста рядом с проблемным действием.",
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

function ContextPreview({ context }: { context: Record<string, unknown> }) {
  const entries = Object.entries(context).slice(0, 8)
  if (entries.length === 0) return <p className="text-slate-500 dark:text-slate-400">Контекст пустой.</p>

  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
          <dt className="text-[11px] text-slate-400 dark:text-slate-500">{contextKeyLabel(key)}</dt>
          <dd className="mt-1 break-words text-slate-700 dark:text-slate-300">{formatContextValue(value)}</dd>
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

function contextKeyLabel(key: string): string {
  const labels: Record<string, string> = {
    source: "Источник",
    route: "Страница",
    path: "Страница",
    orgId: "Организация",
    organizationId: "Организация",
    buildingId: "Здание",
    tenantId: "Арендатор",
    userId: "Пользователь",
    action: "Действие",
    entity: "Сущность",
    entityId: "ID записи",
    form: "Форма",
    method: "Метод",
    language: "Язык браузера",
    timezone: "Часовой пояс",
    viewport: "Размер экрана",
    online: "Браузер онлайн",
  }
  return labels[key] ?? key
}

function formatContextValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return value.length === 0 ? "пустой список" : `список: ${value.length}`
  if (typeof value === "object") return `объект с ${Object.keys(value as Record<string, unknown>).length} полями`
  return String(value)
}
