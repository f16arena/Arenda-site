import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { formatErrorId } from "@/lib/error-id"

export const dynamic = "force-dynamic"

type ErrorReportBody = {
  errorId?: unknown
  source?: unknown
  path?: unknown
  href?: unknown
  message?: unknown
  digest?: unknown
  stack?: unknown
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as ErrorReportBody
  const session = await auth().catch(() => null)
  const digest = clip(body.digest, 240)
  const errorId = clip(body.errorId, 40) || formatErrorId(digest)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null

  const payload = {
    errorId,
    source: clip(body.source, 80) || "unknown",
    path: clip(body.path, 240),
    href: clip(body.href, 500),
    message: clip(body.message, 500),
    digest,
    stack: clip(body.stack, 4_000),
    userAgent: clip(request.headers.get("user-agent"), 500),
    referrer: clip(request.headers.get("referer"), 500),
    userId: session?.user?.id ?? null,
    userRole: session?.user?.role ?? null,
    organizationId: session?.user?.organizationId ?? null,
    at: new Date().toISOString(),
  }

  console.error("[client-error-report]", payload)

  await db.auditLog.create({
    data: {
      userId: session?.user?.id ?? null,
      userName: session?.user?.name ?? null,
      userRole: session?.user?.role ?? null,
      action: "ERROR",
      entity: "system",
      entityId: errorId,
      details: JSON.stringify(payload),
      ip,
    },
  }).catch((error) => {
    console.error("[client-error-report/audit-log-failed]", {
      errorId,
      error: error instanceof Error ? error.message : String(error),
    })
  })

  return NextResponse.json({ ok: true, errorId })
}

function clip(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const normalized = value.replace(/\u0000/g, "").trim()
  if (!normalized) return null
  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized
}
