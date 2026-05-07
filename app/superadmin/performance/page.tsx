export const dynamic = "force-dynamic"

import Link from "next/link"
import type { CSSProperties, ElementType } from "react"
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock,
  Gauge,
  Server,
  ShieldCheck,
  TrendingUp,
} from "lucide-react"
import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import { normalizePage, pageSkip } from "@/lib/pagination"
import { measureServerRoute, measureServerStep } from "@/lib/server-performance"
import { safeServerValue } from "@/lib/server-fallback"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 60
const WATCHED_METRICS = ["LCP", "INP", "CLS", "TTFB"] as const
const METRIC_TARGETS: Record<string, number> = {
  LCP: 2500,
  INP: 200,
  CLS: 0.1,
  FCP: 1800,
  TTFB: 800,
}
const CODE_WATCH_TARGETS = [
  {
    file: "app/admin/floors/[id]/floor-editor.tsx",
    budget: "75 KB",
    action: "Разрезать редактор этажа на lazy-инструменты: AI распознавание, подложка, свойства и опасные действия.",
  },
  {
    file: "lib/faq.ts",
    budget: "55 KB",
    action: "Не раздувать статический FAQ: крупные инструкции хранить в БД и отдавать постранично.",
  },
  {
    file: "app/admin/tenants/[id]/page.tsx",
    budget: "55 KB",
    action: "Держать быстрый верх карточки арендатора, документы/историю/начисления оставлять lazy-секциями.",
  },
  {
    file: "app/admin/page.tsx",
    budget: "55 KB",
    action: "Не возвращать вторичные отчеты в первый render dashboard, сравнение зданий и cashflow держать отдельно.",
  },
  {
    file: "app/admin/spaces/page.tsx",
    budget: "45 KB",
    action: "Не тянуть layout JSON, tenant picker и тяжелый floor view до явного действия пользователя.",
  },
  {
    file: "app/superadmin/performance/page.tsx",
    budget: "40 KB",
    action: "Показывать метрики и подсказки компактно, без превращения страницы скорости в тяжелую страницу.",
  },
] as const

type MetricGroup = {
  name: string
  _avg: { value: number | null }
  _max: { value: number | null }
  _count: { _all: number }
}

type RatingGroup = {
  name: string
  rating: string | null
  _count: { _all: number }
}

type WebVitalSample = {
  id: string
  organizationId: string | null
  name: string
  value: number
  rating: string | null
  path: string | null
  url: string | null
  navigationType: string | null
  createdAt: Date
}

type ServerRouteGroup = {
  route: string
  _avg: { durationMs: number | null }
  _max: { durationMs: number | null }
  _count: { _all: number }
}

type ServerPerformanceRow = {
  id: string
  route: string
  step: string | null
  kind: string
  durationMs: number
  status: string
  error: string | null
  createdAt: Date
}

export default async function SuperadminPerformancePage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string | string[] }>
}) {
  return measureServerRoute("/superadmin/performance", async () => {
    const { userId } = await requirePlatformOwner()
    const resolved = await searchParams
    const page = normalizePage(resolved?.page)
    const now = new Date()
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const safe = <T,>(source: string, promise: Promise<T>, fallback: T) =>
      safeServerValue(promise, fallback, { source, route: "/superadmin/performance", userId })

    const [
      metric24h,
      rating24h,
      slowSamples,
      clsSamples,
      recentRows,
      recentTotal,
      serverRouteGroups,
      serverSlowRows,
      serverLogTotal24h,
      serverErrorTotal24h,
    ] = await measureServerStep(
      "/superadmin/performance",
      "web-vital-summary",
      Promise.all([
        safe(
          "superadmin.performance.metrics24h",
          db.webVitalMetric.groupBy({
            by: ["name"],
            where: { createdAt: { gte: since24h } },
            _avg: { value: true },
            _max: { value: true },
            _count: { _all: true },
          }),
          [] as MetricGroup[],
        ),
        safe(
          "superadmin.performance.ratings24h",
          db.webVitalMetric.groupBy({
            by: ["name", "rating"],
            where: { createdAt: { gte: since24h } },
            _count: { _all: true },
          }),
          [] as RatingGroup[],
        ),
        safe(
          "superadmin.performance.slowSamples",
          db.webVitalMetric.findMany({
            where: {
              createdAt: { gte: since7d },
              name: { in: ["LCP", "INP", "TTFB"] },
              rating: { in: ["poor", "needs-improvement"] },
            },
            orderBy: { value: "desc" },
            take: 100,
            select: sampleSelect,
          }),
          [] as WebVitalSample[],
        ),
        safe(
          "superadmin.performance.clsSamples",
          db.webVitalMetric.findMany({
            where: {
              createdAt: { gte: since7d },
              name: "CLS",
              rating: { in: ["poor", "needs-improvement"] },
            },
            orderBy: { value: "desc" },
            take: 50,
            select: sampleSelect,
          }),
          [] as WebVitalSample[],
        ),
        safe(
          "superadmin.performance.recent",
          db.webVitalMetric.findMany({
            orderBy: { createdAt: "desc" },
            skip: pageSkip(page, PAGE_SIZE),
            take: PAGE_SIZE,
            select: sampleSelect,
          }),
          [] as WebVitalSample[],
        ),
        safe("superadmin.performance.recentTotal", db.webVitalMetric.count(), 0),
        safe(
          "superadmin.performance.serverRouteGroups",
          db.serverPerformanceLog.groupBy({
            by: ["route"],
            where: {
              kind: "ROUTE",
              createdAt: { gte: since24h },
            },
            _avg: { durationMs: true },
            _max: { durationMs: true },
            _count: { _all: true },
          }),
          [] as ServerRouteGroup[],
        ),
        safe(
          "superadmin.performance.serverSlowRows",
          db.serverPerformanceLog.findMany({
            where: { createdAt: { gte: since7d } },
            orderBy: [{ durationMs: "desc" }, { createdAt: "desc" }],
            take: 20,
            select: serverPerformanceSelect,
          }),
          [] as ServerPerformanceRow[],
        ),
        safe(
          "superadmin.performance.serverLogTotal24h",
          db.serverPerformanceLog.count({ where: { createdAt: { gte: since24h } } }),
          0,
        ),
        safe(
          "superadmin.performance.serverErrorTotal24h",
          db.serverPerformanceLog.count({ where: { createdAt: { gte: since24h }, status: "error" } }),
          0,
        ),
      ]),
    )

    const slowByPath = aggregateSlowPages([...slowSamples, ...clsSamples])
    const serverRouteSummary = [...serverRouteGroups]
      .sort((a, b) => (b._max.durationMs ?? 0) - (a._max.durationMs ?? 0) || b._count._all - a._count._all)
    const total24h = metric24h.reduce((sum, item) => sum + item._count._all, 0)
    const bad24h = rating24h
      .filter((item) => item.rating === "poor" || item.rating === "needs-improvement")
      .reduce((sum, item) => sum + item._count._all, 0)
    const badShare = total24h > 0 ? Math.round((bad24h / total24h) * 100) : 0
    const performanceActions = buildPerformanceActions(slowByPath, badShare, total24h)

    return (
      <div className="space-y-6">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
              <Gauge className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Скорость сайта</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
                Реальные Core Web Vitals из браузеров пользователей: какие страницы тормозят, где плохой LCP/INP/CLS и что надо разбирать первым.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/superadmin/system-health"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              <ShieldCheck className="h-4 w-4" />
              Проверка системы
            </Link>
            <Link
              href="/superadmin/errors"
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-500"
            >
              <AlertTriangle className="h-4 w-4" />
              Ошибки сайта
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-5">
          <StatCard icon={Activity} label="Метрик за 24 часа" value={formatInteger(total24h)} hint="LCP, INP, CLS, TTFB, FCP" />
          <StatCard icon={AlertTriangle} label="Требуют внимания" value={`${badShare}%`} hint={`${formatInteger(bad24h)} плохих или средних замеров`} tone={badShare > 20 ? "red" : badShare > 0 ? "amber" : "emerald"} />
          <StatCard icon={Clock} label="Цель LCP" value="до 2.5 с" hint="первый крупный контент" tone="blue" />
          <StatCard icon={TrendingUp} label="Цель INP" value="до 200 мс" hint="отклик интерфейса" tone="purple" />
          <StatCard icon={Server} label="Server logs 24ч" value={formatInteger(serverLogTotal24h)} hint={`ошибок: ${formatInteger(serverErrorTotal24h)}`} tone={serverErrorTotal24h > 0 ? "red" : "cyan"} />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Что оптимизировать первым</h2>
              <p className="mt-1 max-w-3xl text-xs text-slate-500 dark:text-slate-400">
                Система переводит web-vitals в конкретные инженерные действия: какую страницу открыть, какую метрику чинить и какой слой проверить.
              </p>
            </div>
            <Gauge className="h-4 w-4 shrink-0 text-slate-400" />
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {performanceActions.map((action) => (
              <div key={action.title} className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{action.title}</h3>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", priorityClass(action.priority))}>
                    {action.priority}
                  </span>
                </div>
                <p className="text-xs leading-5 text-slate-600 dark:text-slate-400">{action.body}</p>
                {action.path ? (
                  <p className="mt-3 truncate rounded-lg bg-white px-2 py-1.5 font-mono text-[11px] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    {action.path}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Файлы под наблюдением CI</h2>
              <p className="mt-1 max-w-3xl text-xs text-slate-500 dark:text-slate-400">
                Это текущие тяжелые места. `npm run perf:audit` и CI performance gate теперь падают, если эти файлы снова начнут расти сверх отдельного лимита.
              </p>
            </div>
            <ShieldCheck className="h-4 w-4 shrink-0 text-slate-400" />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {CODE_WATCH_TARGETS.map((target) => (
              <div key={target.file} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-mono text-xs text-slate-900 dark:text-slate-100">{target.file}</p>
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                    ≤ {target.budget}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{target.action}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Сводка за 24 часа</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Среднее, максимум и распределение качества.</p>
              </div>
              <BarChart3 className="h-4 w-4 text-slate-400" />
            </div>
            <div className="space-y-3">
              {metric24h.length === 0 ? (
                <EmptyState text="Метрик пока нет. Они появятся после визитов пользователей на сайт." />
              ) : (
                WATCHED_METRICS.map((metric) => {
                  const row = metric24h.find((item) => item.name === metric)
                  const ratings = rating24h.filter((item) => item.name === metric)
                  return (
                    <MetricRow
                      key={metric}
                      metric={metric}
                      avg={row?._avg.value ?? null}
                      max={row?._max.value ?? null}
                      count={row?._count._all ?? 0}
                      ratings={ratings}
                    />
                  )
                })
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Медленные страницы за 7 дней</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Сгруппировано по пути, чтобы сразу видеть, куда идти с оптимизацией.</p>
            </div>
            {slowByPath.length === 0 ? (
              <EmptyState text="Критичных страниц за последние 7 дней не найдено." />
            ) : (
              <div className="space-y-2">
                {slowByPath.slice(0, 8).map((item) => (
                  <div key={item.path} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs text-slate-900 dark:text-slate-100">{item.path}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {item.count} замеров · худшее: {item.worstMetric} {formatMetricValue(item.worstMetric, item.worstValue)}
                        </p>
                      </div>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", ratingClass(item.worstRating))}>
                        {ratingLabel(item.worstRating)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Server routes за 24 часа</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Сколько занял Server Components render по ключевым страницам.</p>
              </div>
              <Server className="h-4 w-4 text-slate-400" />
            </div>
            {serverRouteSummary.length === 0 ? (
              <EmptyState text="Медленных server-route логов пока нет. Они пишутся при превышении порога или при ROUTE_PERF_LOG_ALL=1." />
            ) : (
              <div className="space-y-2">
                {serverRouteSummary.slice(0, 10).map((item) => (
                  <div key={item.route} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs text-slate-900 dark:text-slate-100">{item.route}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {item._count._all} замеров · среднее {formatDurationMs(item._avg.durationMs)}
                        </p>
                      </div>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", durationToneClass(item._max.durationMs ?? 0))}>
                        max {formatDurationMs(item._max.durationMs)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Самые дорогие server steps за 7 дней</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Показывает, какой route или query-блок тормозит до того, как это почувствует браузер.</p>
            </div>
            {serverSlowRows.length === 0 ? (
              <EmptyState text="Медленных server steps за последние 7 дней не найдено." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950/70 dark:text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Route</th>
                      <th className="px-3 py-2">Step</th>
                      <th className="px-3 py-2">Время</th>
                      <th className="px-3 py-2">Статус</th>
                      <th className="px-3 py-2">Когда</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {serverSlowRows.slice(0, 12).map((row) => (
                      <tr key={row.id} className="text-slate-700 dark:text-slate-300">
                        <td className="max-w-[220px] truncate px-3 py-2 font-mono text-xs">{row.route}</td>
                        <td className="max-w-[180px] truncate px-3 py-2 text-xs text-slate-500">{row.step ?? row.kind}</td>
                        <td className="px-3 py-2 font-semibold">{formatDurationMs(row.durationMs)}</td>
                        <td className="px-3 py-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", serverStatusClass(row.status))}>
                            {row.status === "error" ? "ошибка" : "ok"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">{formatDateTime(row.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 p-5 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Последние замеры</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Нужны для расследования: страница, тип метрики, значение, оценка и время.
            </p>
          </div>
          {recentRows.length === 0 ? (
            <div className="p-5">
              <EmptyState text="Последних замеров нет." />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-950/70 dark:text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Страница</th>
                    <th className="px-5 py-3">Метрика</th>
                    <th className="px-5 py-3">Значение</th>
                    <th className="px-5 py-3">Оценка</th>
                    <th className="px-5 py-3">Переход</th>
                    <th className="px-5 py-3">Время</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentRows.map((row) => (
                    <tr key={row.id} className="text-slate-700 dark:text-slate-300">
                      <td className="max-w-[360px] truncate px-5 py-3 font-mono text-xs">{row.path ?? row.url ?? "-"}</td>
                      <td className="px-5 py-3 font-semibold">{row.name}</td>
                      <td className="px-5 py-3">{formatMetricValue(row.name, row.value)}</td>
                      <td className="px-5 py-3">
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", ratingClass(row.rating))}>
                          {ratingLabel(row.rating)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">{row.navigationType ?? "-"}</td>
                      <td className="px-5 py-3 text-xs text-slate-500">{formatDateTime(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-xs text-slate-500 dark:border-slate-800">
            <span>Всего замеров: {formatInteger(recentTotal)}</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={`/superadmin/performance?page=${page - 1}`} className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
                  Назад
                </Link>
              )}
              {page * PAGE_SIZE < recentTotal && (
                <Link href={`/superadmin/performance?page=${page + 1}`} className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800">
                  Дальше
                </Link>
              )}
            </div>
          </div>
        </section>
      </div>
    )
  })
}

const sampleSelect = {
  id: true,
  organizationId: true,
  name: true,
  value: true,
  rating: true,
  path: true,
  url: true,
  navigationType: true,
  createdAt: true,
} as const

const serverPerformanceSelect = {
  id: true,
  route: true,
  step: true,
  kind: true,
  durationMs: true,
  status: true,
  error: true,
  createdAt: true,
} as const

function MetricRow({
  metric,
  avg,
  max,
  count,
  ratings,
}: {
  metric: string
  avg: number | null
  max: number | null
  count: number
  ratings: RatingGroup[]
}) {
  const target = METRIC_TARGETS[metric]
  const avgTone = avg == null || target == null || avg <= target ? "emerald" : avg <= target * 1.5 ? "amber" : "red"
  const total = ratings.reduce((sum, item) => sum + item._count._all, 0)
  const good = ratings.find((item) => item.rating === "good")?._count._all ?? 0
  const needs = ratings.find((item) => item.rating === "needs-improvement")?._count._all ?? 0
  const poor = ratings.find((item) => item.rating === "poor")?._count._all ?? 0

  return (
    <div className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900 dark:text-slate-100">{metric}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">цель: {target ? formatMetricValue(metric, target) : "без цели"}</p>
        </div>
        <div className="text-right">
          <p className={cn("text-sm font-semibold", toneTextClass(avgTone))}>
            среднее {avg == null ? "-" : formatMetricValue(metric, avg)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            максимум {max == null ? "-" : formatMetricValue(metric, max)} · {count} замеров
          </p>
        </div>
      </div>
      {total > 0 && (
        <div className="mt-3 grid h-2 grid-cols-[var(--good)_var(--needs)_var(--poor)] overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" style={{
          "--good": `${Math.max((good / total) * 100, good ? 4 : 0)}fr`,
          "--needs": `${Math.max((needs / total) * 100, needs ? 4 : 0)}fr`,
          "--poor": `${Math.max((poor / total) * 100, poor ? 4 : 0)}fr`,
        } as CSSProperties}>
          <div className="bg-emerald-500" />
          <div className="bg-amber-500" />
          <div className="bg-red-500" />
        </div>
      )}
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "cyan",
}: {
  icon: ElementType
  label: string
  value: string
  hint: string
  tone?: "cyan" | "red" | "amber" | "emerald" | "blue" | "purple"
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className={cn("mb-4 flex h-9 w-9 items-center justify-center rounded-lg", toneBgClass(tone))}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
      {text}
    </div>
  )
}

function aggregateSlowPages(samples: WebVitalSample[]) {
  const map = new Map<string, {
    path: string
    count: number
    worstMetric: string
    worstValue: number
    worstRating: string | null
    worstScore: number
  }>()

  for (const sample of samples) {
    const path = sample.path ?? sample.url ?? "unknown"
    const target = METRIC_TARGETS[sample.name] ?? 1
    const score = target > 0 ? sample.value / target : sample.value
    const current = map.get(path)
    if (!current) {
      map.set(path, {
        path,
        count: 1,
        worstMetric: sample.name,
        worstValue: sample.value,
        worstRating: sample.rating,
        worstScore: score,
      })
      continue
    }
    current.count += 1
    if (score > current.worstScore) {
      current.worstMetric = sample.name
      current.worstValue = sample.value
      current.worstRating = sample.rating
      current.worstScore = score
    }
  }

  return Array.from(map.values()).sort((a, b) => b.worstScore - a.worstScore || b.count - a.count)
}

function buildPerformanceActions(
  slowByPath: ReturnType<typeof aggregateSlowPages>,
  badShare: number,
  total24h: number,
) {
  if (total24h === 0) {
    return [
      {
        title: "Сначала собрать данные",
        priority: "setup",
        path: "/api/web-vitals",
        body: "Откройте сайт в production и пройдите основные страницы. После первых реальных визитов здесь появятся LCP, INP, CLS и TTFB.",
      },
      {
        title: "Проверить скрипт метрик",
        priority: "setup",
        path: "components/web-vitals-reporter.tsx",
        body: "Если замеры не появляются, проверьте подключение reporter в layout и доступность API сохранения web-vitals.",
      },
      {
        title: "Держать бюджет скорости",
        priority: "guard",
        path: "npm run perf:audit",
        body: "Performance audit должен падать при слишком больших client/server файлах, больших Prisma take и страницах без server timing.",
      },
    ]
  }

  const worst = slowByPath[0]
  const metric = worst?.worstMetric ?? "LCP"
  const metricAction = actionForMetric(metric, worst?.path)
  const scopeAction = badShare > 20
    ? {
        title: "Много плохих замеров",
        priority: "high",
        path: worst?.path,
        body: `Плохих или средних замеров ${badShare}%. Сначала чините самую верхнюю страницу из списка: там эффект будет заметнее всего для пользователей.`,
      }
    : {
        title: "Точечная оптимизация",
        priority: "normal",
        path: worst?.path,
        body: "Критической деградации нет, но можно убрать самые дорогие запросы и тяжелые client components на страницах из списка.",
      }

  return [
    scopeAction,
    metricAction,
    {
      title: "Проверить базу",
      priority: "guard",
      path: "prisma/schema.prisma",
      body: "Для медленных admin-страниц проверьте индексы под organizationId, buildingId, tenantId, status, period и createdAt, затем сравните server timing до и после.",
    },
  ]
}

function actionForMetric(metric: string, path?: string) {
  if (metric === "INP") {
    return {
      title: "Уменьшить JS и клики",
      priority: "high",
      path,
      body: "INP страдает от тяжелого клиентского JavaScript. Вынесите редакторы, графики, поиск и модалки в lazy sections, а кнопки оставьте легкими.",
    }
  }

  if (metric === "CLS") {
    return {
      title: "Зафиксировать размеры",
      priority: "medium",
      path,
      body: "CLS означает скачки интерфейса. Задайте размеры изображениям, таблицам, карточкам и баннерам, чтобы контент не прыгал при загрузке.",
    }
  }

  if (metric === "TTFB") {
    return {
      title: "Сократить server work",
      priority: "high",
      path,
      body: "TTFB упирается в сервер. Разбейте большие Prisma запросы, уберите лишние include, добавьте count/groupBy вместо загрузки списков и кешируйте shell.",
    }
  }

  return {
    title: "Ускорить первый экран",
    priority: "high",
    path,
    body: "LCP чинится через быстрый первый экран: меньше server-запросов до render, меньше тяжелых изображений, lazy ниже первого экрана и preload ключевых assets.",
  }
}

function formatMetricValue(name: string, value: number) {
  if (name === "CLS") return value.toFixed(3)
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} с`
  return `${Math.round(value)} мс`
}

function formatDurationMs(value: number | null) {
  if (value == null) return "-"
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)} с`
  return `${Math.round(value)} мс`
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value)
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value)
}

function ratingLabel(value: string | null) {
  if (value === "good") return "хорошо"
  if (value === "needs-improvement") return "средне"
  if (value === "poor") return "плохо"
  return "нет оценки"
}

function ratingClass(value: string | null) {
  if (value === "good") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
  if (value === "needs-improvement") return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
  if (value === "poor") return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
}

function durationToneClass(value: number) {
  if (value >= 1500) return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
  if (value >= 900) return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
}

function serverStatusClass(value: string) {
  if (value === "error") return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
}

function priorityClass(value: string) {
  if (value === "high") return "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300"
  if (value === "medium") return "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
  if (value === "guard") return "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
  if (value === "setup") return "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300"
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
}

function toneBgClass(tone: "cyan" | "red" | "amber" | "emerald" | "blue" | "purple") {
  const classes = {
    cyan: "bg-cyan-500/10 text-cyan-500 dark:text-cyan-300",
    red: "bg-red-500/10 text-red-500 dark:text-red-300",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-300",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
    purple: "bg-purple-500/10 text-purple-600 dark:text-purple-300",
  }
  return classes[tone]
}

function toneTextClass(tone: "emerald" | "amber" | "red") {
  const classes = {
    emerald: "text-emerald-600 dark:text-emerald-300",
    amber: "text-amber-600 dark:text-amber-300",
    red: "text-red-600 dark:text-red-300",
  }
  return classes[tone]
}
