export const dynamic = "force-dynamic"

import Link from "next/link"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Clock,
  ExternalLink,
  RefreshCw,
  Server,
  ShieldCheck,
} from "lucide-react"
import { requireSection } from "@/lib/acl"
import { requireOrgAccess } from "@/lib/org"
import {
  runSystemHealthChecks,
  summarizeSystemChecks,
  type SystemCheck,
  type SystemCheckStatus,
} from "@/lib/system-health"
import { getReleaseInfo } from "@/lib/release"

const statusMeta: Record<SystemCheckStatus, {
  label: string
  icon: typeof CheckCircle2
  box: string
  pill: string
  border: string
}> = {
  ok: {
    label: "Работает",
    icon: CheckCircle2,
    box: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300",
    pill: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-500/30",
  },
  warning: {
    label: "Внимание",
    icon: CircleAlert,
    box: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
    pill: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-500/30",
  },
  error: {
    label: "Критично",
    icon: AlertTriangle,
    box: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300",
    pill: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
    border: "border-red-200 dark:border-red-500/30",
  },
}

export default async function SystemHealthPage() {
  await requireSection("analytics", "view")
  await requireOrgAccess()

  const [checks, release] = await Promise.all([
    runSystemHealthChecks(),
    getReleaseInfo(),
  ])
  const summary = summarizeSystemChecks(checks)
  const checkedAt = new Date()

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Проверка системы</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Production readiness: база, миграции, env, cron, email, sitemap и журнал ошибок.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/api/health"
            target="_blank"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800/60"
          >
            <ExternalLink className="h-4 w-4" />
            JSON
          </Link>
          <Link
            href="/admin/system-health"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <RefreshCw className="h-4 w-4" />
            Обновить
          </Link>
        </div>
      </div>

      <section className={`rounded-xl border bg-white p-5 dark:bg-slate-900 ${statusMeta[summary.status].border}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <StatusIcon status={summary.status} />
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {summary.status === "ok"
                  ? "Система готова к работе"
                  : summary.status === "warning"
                    ? "Система работает, но есть предупреждения"
                    : "Есть критичные проблемы"}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Версия сборки: <span className="font-mono">{release.version}</span>
                {" "}· commit <span className="font-mono">{release.commitShort}</span>
                {" "}· проверено {formatDateTime(checkedAt)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center sm:min-w-80">
            <SummaryBadge label="OK" value={summary.okCount} tone="emerald" />
            <SummaryBadge label="Внимание" value={summary.warningCount} tone="amber" />
            <SummaryBadge label="Критично" value={summary.errorCount} tone="red" />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {checks.map((check) => (
          <CheckCard key={check.id} check={check} />
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Server className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Как пользоваться</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Перед push/deploy открывайте эту страницу: если есть красный блок, сначала исправляем его. Желтые блоки не всегда ломают сайт, но это список того, что нужно довести до production-уровня.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

function CheckCard({ check }: { check: SystemCheck }) {
  const meta = statusMeta[check.status]
  const Icon = meta.icon

  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 p-5 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.box}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{check.label}</h2>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.pill}`}>
                {meta.label}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{check.message}</p>
          </div>
          {typeof check.ms === "number" && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              {check.ms} ms
            </span>
          )}
        </div>
      </div>

      {check.details && check.details.length > 0 && (
        <div className="space-y-2 p-5">
          {check.details.map((detail) => (
            <div key={detail} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" />
              <span>{detail}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function StatusIcon({ status }: { status: SystemCheckStatus }) {
  const meta = statusMeta[status]
  const Icon = meta.icon
  return (
    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${meta.box}`}>
      <Icon className="h-5 w-5" />
    </div>
  )
}

function SummaryBadge({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "red" }) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    red: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
  }

  return (
    <div className={`rounded-lg px-3 py-2 ${tones[tone]}`}>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[11px] opacity-80">{label}</p>
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
