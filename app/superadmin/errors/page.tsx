export const dynamic = "force-dynamic"

import Link from "next/link"
import { AlertTriangle, Bug, ExternalLink, Search, ServerCrash, ShieldAlert } from "lucide-react"
import type { Prisma } from "@/app/generated/prisma/client"
import { db } from "@/lib/db"
import { decodeErrorReport, parseErrorDetails } from "@/lib/error-report"
import { requirePlatformOwner } from "@/lib/org"
import { normalizePage, pageSkip } from "@/lib/pagination"
import { cn } from "@/lib/utils"
import { PaginationControls } from "@/components/ui/pagination-controls"
import { safeServerValue } from "@/lib/server-fallback"

const PAGE_SIZE = 30

export default async function SuperadminErrorsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string | string[]; q?: string | string[]; kind?: string | string[] }>
}) {
  const { userId } = await requirePlatformOwner()
  const resolved = await searchParams
  const page = normalizePage(resolved?.page)
  const query = normalizeQuery(resolved?.q)
  const kind = normalizeKind(resolved?.kind)
  const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
    safeServerValue(promise, fallback, { source, route: "/superadmin/errors", userId })

  const filters: Prisma.AuditLogWhereInput[] = []
  if (kind) {
    filters.push({ details: { contains: `"routeKind":"${kind}"`, mode: "insensitive" } })
  }
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
  const [logs, total, totalAll, last24Count] = await Promise.all([
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
    safe(
      "superadmin.errors.last24Count",
      db.auditLog.count({ where: { action: "ERROR", createdAt: { gte: last24 } } }),
      0,
    ),
  ])

  const parsed = logs.map((log) => ({ log, details: parseErrorDetails(log.details) }))
  const orgIds = Array.from(new Set(parsed.map((x) => x.details.organizationId).filter(Boolean) as string[]))
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

  const serverComponentCount = parsed.filter((x) => {
    const d = x.details
    const text = `${d.message ?? ""} ${d.digest ?? ""} ${d.source ?? ""}`.toLowerCase()
    return text.includes("server components render") || (!!d.digest && `${d.source ?? ""}`.includes("/error"))
  }).length

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
              Единый журнал падений public/admin/cabinet/superadmin с расшифровкой и контекстом.
            </p>
          </div>
        </div>

        <form action="/superadmin/errors" className="flex w-full gap-2 lg:w-[560px]">
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
            <option value="admin">Admin</option>
            <option value="cabinet">Cabinet</option>
            <option value="superadmin">Superadmin</option>
            <option value="public">Public</option>
            <option value="server-action">Server action</option>
            <option value="server">Server</option>
          </select>
          <button className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700">
            Найти
          </button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={ShieldAlert} label="Всего ошибок" value={totalAll} tone="red" />
        <StatCard icon={AlertTriangle} label="За 24 часа" value={last24Count} tone="amber" />
        <StatCard icon={ServerCrash} label="На этой странице с Server Component" value={serverComponentCount} tone="purple" />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {parsed.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Bug className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-700" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Ошибок не найдено</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Попробуйте изменить поисковый запрос.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {parsed.map(({ log, details }) => {
              const decoded = decodeErrorReport(details)
              const org = details.organizationId ? orgMap.get(details.organizationId) : null
              return (
                <article key={log.id} className="p-5">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          decoded.severity === "critical"
                            ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
                            : decoded.severity === "warning"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
                        )}>
                          {decoded.severity.toUpperCase()}
                        </span>
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{decoded.title}</h2>
                        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">#{details.errorId ?? log.entityId ?? log.id}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {new Date(log.createdAt).toLocaleString("ru-RU")} · {details.routeKind ?? "unknown"} · {org ? `${org.name} (${org.slug})` : "platform/public"}
                      </p>
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
                        href={`/superadmin/audit?q=${encodeURIComponent(details.errorId ?? log.entityId ?? log.id)}`}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/50"
                      >
                        В audit
                      </Link>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1fr]">
                    <InfoBox title="Расшифровка" text={details.explanation ?? decoded.explanation} />
                    <InfoBox title="Что делать" text={details.suggestedAction ?? decoded.suggestedAction} />
                  </div>

                  <dl className="mt-4 grid gap-3 text-xs md:grid-cols-2 xl:grid-cols-4">
                    <Field label="Страница" value={details.path ?? "—"} mono />
                    <Field label="Digest" value={details.digest ?? "—"} mono />
                    <Field label="Пользователь" value={`${log.userName ?? "Система"}${log.userRole ? ` (${log.userRole})` : ""}`} />
                    <Field label="IP / Host" value={`${log.ip ?? "—"} · ${details.host ?? "—"}`} mono />
                  </dl>

                  {details.message && (
                    <pre className="mt-4 max-h-24 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                      {details.message}
                    </pre>
                  )}

                  {(details.stack || details.context) && (
                    <div className="mt-4 grid gap-3 xl:grid-cols-2">
                      {details.stack && (
                        <details className="rounded-lg border border-slate-100 p-3 text-xs dark:border-slate-800">
                          <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-300">
                            Stack trace
                          </summary>
                          <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[11px] text-slate-100">
                            {details.stack}
                          </pre>
                        </details>
                      )}
                      {details.context && (
                        <details className="rounded-lg border border-slate-100 p-3 text-xs dark:border-slate-800">
                          <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-300">
                            Контекст
                          </summary>
                          <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[11px] text-slate-100">
                            {JSON.stringify(details.context, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}

                  {details.hints && details.hints.length > 0 && (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-500 dark:text-slate-400">
                      {details.hints.map((hint) => <li key={hint}>{hint}</li>)}
                    </ul>
                  )}
                </article>
              )
            })}
          </div>
        )}

        <PaginationControls
          basePath="/superadmin/errors"
          params={{ q: query, kind }}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
        />
      </div>
    </div>
  )
}

function normalizeQuery(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value
  return (raw ?? "").trim().slice(0, 120)
}

function normalizeKind(value: string | string[] | undefined): string {
  const raw = (Array.isArray(value) ? value[0] : value ?? "").trim()
  return ["admin", "cabinet", "superadmin", "public", "server-action", "server"].includes(raw) ? raw : ""
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
  tone: "red" | "amber" | "purple"
}) {
  const tones = {
    red: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-300",
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
