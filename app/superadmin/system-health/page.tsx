export const dynamic = "force-dynamic"

import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  Bug,
  CheckCircle2,
  CircleAlert,
  Clock,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react"
import {
  runSystemHealthChecks,
  summarizeSystemChecks,
  type SystemCheck,
  type SystemCheckStatus,
} from "@/lib/system-health"
import { getReleaseInfo } from "@/lib/release"
import { requirePlatformOwner } from "@/lib/org"
import { cn } from "@/lib/utils"

const statusMeta: Record<SystemCheckStatus, {
  label: string
  title: string
  icon: LucideIcon
  iconClass: string
  pillClass: string
  borderClass: string
}> = {
  ok: {
    label: "Работает",
    title: "Система готова к работе",
    icon: CheckCircle2,
    iconClass: "bg-emerald-500/10 text-emerald-300",
    pillClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    borderClass: "border-emerald-500/30",
  },
  warning: {
    label: "Внимание",
    title: "Система работает, но есть предупреждения",
    icon: CircleAlert,
    iconClass: "bg-amber-500/10 text-amber-300",
    pillClass: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    borderClass: "border-amber-500/30",
  },
  error: {
    label: "Критично",
    title: "Есть критичные проблемы",
    icon: AlertTriangle,
    iconClass: "bg-red-500/10 text-red-300",
    pillClass: "border-red-500/30 bg-red-500/10 text-red-300",
    borderClass: "border-red-500/30",
  },
}

export default async function SuperadminSystemHealthPage() {
  await requirePlatformOwner()

  const [checks, release] = await Promise.all([
    runSystemHealthChecks(),
    getReleaseInfo(),
  ])
  const summary = summarizeSystemChecks(checks)
  const checkedAt = new Date()

  const critical = checks.filter((check) => check.status === "error")
  const warnings = checks.filter((check) => check.status === "warning")

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/15 text-purple-200">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Проверка системы</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Единая панель production readiness для владельца SaaS: база, миграции, RLS, cron, env, storage и скорость.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/superadmin/errors"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            <Bug className="h-4 w-4" />
            Ошибки сайта
          </Link>
          <Link
            href="/api/health"
            target="_blank"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            <ExternalLink className="h-4 w-4" />
            API health
          </Link>
          <Link
            href="/superadmin/system-health"
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-500"
          >
            <RefreshCw className="h-4 w-4" />
            Обновить
          </Link>
        </div>
      </header>

      <section className={cn("rounded-2xl border bg-slate-950 p-5 text-white shadow-sm", statusMeta[summary.status].borderClass)}>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <StatusIcon status={summary.status} size="lg" />
            <div>
              <h2 className="text-lg font-semibold">{statusMeta[summary.status].title}</h2>
              <p className="mt-1 text-sm text-slate-400">
                Версия <span className="font-mono text-slate-200">{release.version}</span>
                {" "}· commit <span className="font-mono text-slate-200">{release.commitShort}</span>
                {" "}· проверено {formatDateTime(checkedAt)}
              </p>
              <p className="mt-3 max-w-3xl text-sm text-slate-300">
                Красный блок значит, что перед deploy лучше остановиться. Желтый блок не всегда ломает сайт прямо сейчас,
                но показывает, что нужно довести до production-уровня.
              </p>
            </div>
          </div>

          <div className="grid min-w-full grid-cols-3 gap-3 sm:min-w-96">
            <SummaryTile label="OK" value={summary.okCount} tone="emerald" />
            <SummaryTile label="Внимание" value={summary.warningCount} tone="amber" />
            <SummaryTile label="Критично" value={summary.errorCount} tone="red" />
          </div>
        </div>
      </section>

      {(critical.length > 0 || warnings.length > 0) && (
        <section className="grid gap-4 lg:grid-cols-2">
          <PriorityPanel
            title="Что чинить первым"
            icon={AlertTriangle}
            empty="Критичных проблем нет."
            checks={critical}
          />
          <PriorityPanel
            title="Что довести после"
            icon={CircleAlert}
            empty="Предупреждений нет."
            checks={warnings}
          />
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        {checks.map((check) => (
          <CheckCard key={check.id} check={check} />
        ))}
      </section>
    </div>
  )
}

function PriorityPanel({
  title,
  icon: Icon,
  empty,
  checks,
}: {
  title: string
  icon: LucideIcon
  empty: string
  checks: SystemCheck[]
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-amber-300" />
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
      </div>
      {checks.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="space-y-3">
          {checks.slice(0, 5).map((check) => (
            <div key={check.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
              <p className="text-sm font-semibold text-slate-100">{check.label}</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">{check.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CheckCard({ check }: { check: SystemCheck }) {
  const meta = statusMeta[check.status]

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-950">
      <div className="border-b border-slate-800 p-5">
        <div className="flex items-start gap-3">
          <StatusIcon status={check.status} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100">{check.label}</h2>
              <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-medium", meta.pillClass)}>
                {meta.label}
              </span>
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-400">{check.message}</p>
          </div>
          {typeof check.ms === "number" && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              {check.ms} ms
            </span>
          )}
        </div>
      </div>

      {check.details && check.details.length > 0 && (
        <div className="space-y-2 p-5">
          {check.details.map((detail, index) => (
            <div key={`${check.id}-${index}`} className="flex items-start gap-2 text-sm leading-6 text-slate-300">
              <Activity className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-600" />
              <span>{detail}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

function StatusIcon({ status, size = "md" }: { status: SystemCheckStatus; size?: "md" | "lg" }) {
  const meta = statusMeta[status]
  const Icon = meta.icon

  return (
    <div className={cn(
      "flex shrink-0 items-center justify-center rounded-xl",
      meta.iconClass,
      size === "lg" ? "h-12 w-12" : "h-9 w-9",
    )}>
      <Icon className={size === "lg" ? "h-6 w-6" : "h-4 w-4"} />
    </div>
  )
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "red" }) {
  const toneClass = {
    emerald: "bg-emerald-500/10 text-emerald-300",
    amber: "bg-amber-500/10 text-amber-300",
    red: "bg-red-500/10 text-red-300",
  }[tone]

  return (
    <div className={cn("rounded-xl px-4 py-3", toneClass)}>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs opacity-80">{label}</p>
    </div>
  )
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}
