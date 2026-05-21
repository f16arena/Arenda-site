import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"

export const dynamic = "force-dynamic"

const METRIC_TARGETS: Record<string, number> = { LCP: 2500, INP: 200, CLS: 0.1, FCP: 1800, TTFB: 800 }

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

// GET /superadmin/performance/export
// Полная выгрузка данных страницы «Скорость сайта» одним JSON-файлом.
// Доступ только платформенному владельцу.
export async function GET() {
  await requirePlatformOwner()

  const now = new Date()
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [
    metric24h,
    rating24h,
    slowSamples,
    clsSamples,
    recentSamples,
    recentTotal,
    serverRouteGroups,
    serverSlowRows,
    serverLogTotal24h,
    serverErrorTotal24h,
  ] = await Promise.all([
    db.webVitalMetric.groupBy({
      by: ["name"],
      where: { createdAt: { gte: since24h } },
      _avg: { value: true },
      _max: { value: true },
      _count: { _all: true },
    }),
    db.webVitalMetric.groupBy({
      by: ["name", "rating"],
      where: { createdAt: { gte: since24h } },
      _count: { _all: true },
    }),
    db.webVitalMetric.findMany({
      where: { createdAt: { gte: since7d }, name: { in: ["LCP", "INP", "TTFB"] }, rating: { in: ["poor", "needs-improvement"] } },
      orderBy: { value: "desc" },
      take: 100,
      select: sampleSelect,
    }),
    db.webVitalMetric.findMany({
      where: { createdAt: { gte: since7d }, name: "CLS", rating: { in: ["poor", "needs-improvement"] } },
      orderBy: { value: "desc" },
      take: 100,
      select: sampleSelect,
    }),
    db.webVitalMetric.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: sampleSelect }),
    db.webVitalMetric.count(),
    db.serverPerformanceLog.groupBy({
      by: ["route"],
      where: { kind: "ROUTE", createdAt: { gte: since24h } },
      _avg: { durationMs: true },
      _max: { durationMs: true },
      _count: { _all: true },
    }),
    db.serverPerformanceLog.findMany({
      where: { createdAt: { gte: since7d } },
      orderBy: [{ durationMs: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: { id: true, route: true, step: true, kind: true, durationMs: true, status: true, error: true, createdAt: true },
    }),
    db.serverPerformanceLog.count({ where: { createdAt: { gte: since24h } } }),
    db.serverPerformanceLog.count({ where: { createdAt: { gte: since24h }, status: "error" } }),
  ])

  const total24h = metric24h.reduce((sum, item) => sum + item._count._all, 0)
  const bad24h = rating24h
    .filter((item) => item.rating === "poor" || item.rating === "needs-improvement")
    .reduce((sum, item) => sum + item._count._all, 0)
  const badShare = total24h > 0 ? Math.round((bad24h / total24h) * 100) : 0

  const slowPages7d = aggregateSlowPages([...slowSamples, ...clsSamples])

  const payload = {
    exportedAt: now.toISOString(),
    window: { now: now.toISOString(), since24h: since24h.toISOString(), since7d: since7d.toISOString() },
    summary: { metrics24hTotal: total24h, bad24h, badShare, serverLogTotal24h, serverErrorTotal24h, recentTotal },
    webVitals24h: { metrics: metric24h, ratings: rating24h, targets: METRIC_TARGETS },
    slowPages7d,
    slowSamples7d: [...slowSamples, ...clsSamples].map(serializeSample),
    serverRoutes24h: serverRouteGroups,
    serverSlowSteps7d: serverSlowRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    recentSamples: recentSamples.map(serializeSample),
  }

  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-")
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="commrent-performance-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  })
}

type Sample = {
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

function serializeSample(s: Sample) {
  return { ...s, createdAt: s.createdAt.toISOString() }
}

function aggregateSlowPages(samples: Sample[]) {
  const map = new Map<string, { path: string; count: number; worstMetric: string; worstValue: number; worstRating: string | null; worstScore: number }>()
  for (const sample of samples) {
    const path = sample.path ?? sample.url ?? "unknown"
    const target = METRIC_TARGETS[sample.name] ?? 1
    const score = target > 0 ? sample.value / target : sample.value
    const current = map.get(path)
    if (!current) {
      map.set(path, { path, count: 1, worstMetric: sample.name, worstValue: sample.value, worstRating: sample.rating, worstScore: score })
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
