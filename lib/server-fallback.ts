import "server-only"

import { db } from "@/lib/db"
import { formatErrorId } from "@/lib/error-id"
import { decodeErrorReport } from "@/lib/error-report"

type ServerFallbackContext = {
  source: string
  route?: string
  orgId?: string | null
  userId?: string | null
  entity?: string
  entityId?: string | null
  extra?: Record<string, unknown>
}

export async function safeServerValue<T>(
  promise: Promise<T>,
  fallback: T,
  context: ServerFallbackContext,
): Promise<T> {
  try {
    return await promise
  } catch (error) {
    await logServerFallback(error, context)
    return fallback
  }
}

export async function logServerFallback(error: unknown, context: ServerFallbackContext) {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack ?? null : null
  const errorId = formatErrorId(`${context.source}:${context.route ?? ""}:${message}:${stack ?? ""}`)
  const decoded = decodeErrorReport({
    source: context.source,
    path: context.route,
    message,
    stack,
  })

  const payload = {
    errorId,
    source: context.source,
    path: context.route ?? null,
    message: clip(message, 1_000),
    stack: clip(stack, 4_000),
    organizationId: context.orgId ?? null,
    userId: context.userId ?? null,
    routeKind: context.route?.startsWith("/superadmin")
      ? "superadmin"
      : context.route?.startsWith("/admin")
        ? "admin"
        : context.route?.startsWith("/cabinet")
          ? "cabinet"
          : "server",
    explanation: decoded.explanation,
    suggestedAction: decoded.suggestedAction,
    hints: decoded.hints,
    context: context.extra ?? null,
    at: new Date().toISOString(),
  }

  console.error("[server-fallback]", payload)

  await db.auditLog.create({
    data: {
      userId: context.userId ?? null,
      userName: null,
      userRole: null,
      action: "ERROR",
      entity: context.entity ?? "server-fallback",
      entityId: context.entityId ?? errorId,
      details: JSON.stringify(payload),
      ip: null,
    },
  }).catch((auditError) => {
    console.error("[server-fallback/audit-log-failed]", {
      errorId,
      error: auditError instanceof Error ? auditError.message : String(auditError),
    })
  })
}

function clip(value: string | null, max: number): string | null {
  if (!value) return null
  return value.length > max ? `${value.slice(0, max)}...` : value
}
