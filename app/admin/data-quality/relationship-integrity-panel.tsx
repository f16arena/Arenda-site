"use client"

import Link from "next/link"
import { AlertTriangle, CheckCircle2, CircleAlert, Info } from "lucide-react"
import type { RelationshipIntegrityOverview } from "@/lib/relationship-integrity"

type Severity = "critical" | "warning" | "info"

const severityMeta: Record<Severity, { label: string; icon: typeof AlertTriangle; pill: string; iconBox: string }> = {
  critical: {
    label: "Критично",
    icon: AlertTriangle,
    pill: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
    iconBox: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300",
  },
  warning: {
    label: "Внимание",
    icon: CircleAlert,
    pill: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
    iconBox: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300",
  },
  info: {
    label: "Контроль",
    icon: Info,
    pill: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
    iconBox: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300",
  },
}

export function RelationshipIntegrityPanel({ overview }: { overview: RelationshipIntegrityOverview }) {
  if (overview.summary.total === 0) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-300" />
          <div>
            <h2 className="text-base font-semibold text-emerald-950 dark:text-emerald-100">Связи SaaS выглядят цельно</h2>
            <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-200">
              Тариф, доступы, арендаторы, документы, финансы, счетчики и хранилище не показывают разорванных связей.
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Карта связей SaaS</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Это проверки не отдельных полей, а цепочек: тарифы, доступы, здания, арендаторы, договоры, платежи, счетчики, документы и storage.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            Критично: {overview.summary.critical}
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            Внимание: {overview.summary.warning}
          </span>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
            Контроль: {overview.summary.info}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {overview.contours.map((contour) => (
          <div key={contour.key} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{contour.label}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{contour.description}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {contour.count}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {contour.issues.slice(0, 3).map((issue) => {
                const meta = severityMeta[issue.severity]
                return (
                  <Link
                    key={issue.key}
                    href={issue.href}
                    className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900 dark:text-slate-100">{issue.title}</span>
                      <span className="mt-0.5 block line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{issue.description}</span>
                    </span>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.pill}`}>
                      {issue.count}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
