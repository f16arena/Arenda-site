import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

const ALLOWED_METRICS = new Set(["CLS", "FCP", "INP", "LCP", "TTFB"])

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const metric = parseMetric(body)
  if (!metric) return NextResponse.json({ ok: false }, { status: 400 })

  const session = await auth().catch(() => null)
  await db.webVitalMetric.create({
    data: {
      organizationId: session?.user.organizationId ?? null,
      userId: session?.user.id ?? null,
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      navigationType: metric.navigationType,
      path: metric.path,
      url: metric.url,
      userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    },
  }).catch(() => null)

  return NextResponse.json({ ok: true })
}

function parseMetric(value: unknown) {
  if (!value || typeof value !== "object") return null
  const source = value as Record<string, unknown>
  const name = typeof source.name === "string" ? source.name : ""
  const metricValue = Number(source.value)
  if (!ALLOWED_METRICS.has(name) || !Number.isFinite(metricValue)) return null

  return {
    name,
    value: metricValue,
    rating: readString(source.rating, 20),
    delta: readNumber(source.delta),
    navigationType: readString(source.navigationType, 40),
    path: readString(source.path, 300),
    url: readString(source.url, 600),
  }
}

function readString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLength) : null
}

function readNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
