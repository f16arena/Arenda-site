import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/lib/db"
import { formatErrorId } from "@/lib/error-id"
import { decodeErrorReport } from "@/lib/error-report"
import { captureServerException } from "@/lib/sentry-server"

export const dynamic = "force-dynamic"

type ErrorReportBody = {
  errorId?: unknown
  source?: unknown
  path?: unknown
  href?: unknown
  message?: unknown
  digest?: unknown
  stack?: unknown
  sentryEventId?: unknown
  context?: unknown
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as ErrorReportBody
  const session = await auth().catch(() => null)
  const digest = clip(body.digest, 240)
  const errorId = clip(body.errorId, 40) || formatErrorId(digest)
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null
  const source = clip(body.source, 80) || "unknown"
  const path = clip(body.path, 240)
  const href = clip(body.href, 500)
  const message = clip(body.message, 500)
  const stack = clip(body.stack, 4_000)
  const sentryEventId = clip(body.sentryEventId, 80)
  const decode = decodeErrorReport({ source, path, href, message, digest, stack })

  const payload = {
    errorId,
    source,
    path,
    href,
    message,
    digest,
    stack,
    sentryEventId,
    userAgent: clip(request.headers.get("user-agent"), 500),
    referrer: clip(request.headers.get("referer"), 500),
    userId: session?.user?.id ?? null,
    userRole: session?.user?.role ?? null,
    organizationId: session?.user?.organizationId ?? null,
    method: request.method,
    host: clip(request.headers.get("host"), 180),
    routeKind: path?.startsWith("/superadmin")
      ? "superadmin"
      : path?.startsWith("/admin")
        ? "admin"
        : path?.startsWith("/cabinet")
          ? "cabinet"
          : "public",
    explanation: decode.explanation,
    suggestedAction: decode.suggestedAction,
    hints: decode.hints,
    context: isPlainObject(body.context) ? body.context : null,
    at: new Date().toISOString(),
  }

  if (!payload.sentryEventId) {
    payload.sentryEventId = await captureServerException(new Error(message ?? `Client error report ${errorId}`), {
      errorId,
      source,
      path,
      userId: payload.userId,
      userRole: payload.userRole,
      organizationId: payload.organizationId,
      routeKind: payload.routeKind,
      context: payload.context,
    })
  }

  console.error("[client-error-report]", payload)

  await db.auditLog.create({
    data: {
      userId: session?.user?.id ?? null,
      userName: session?.user?.name ?? null,
      userRole: session?.user?.role ?? null,
      action: "ERROR",
      entity: "error",
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
