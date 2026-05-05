import "server-only"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { formatErrorId } from "@/lib/error-id"
import { decodeErrorReport } from "@/lib/error-report"
import { captureServerException } from "@/lib/sentry-server"
import { headers } from "next/headers"

type ActionErrorContext = {
  source: string
  route?: string
  orgId?: string | null
  userId?: string | null
  entity?: string
  entityId?: string | null
  input?: Record<string, unknown>
}

export type ActionErrorResult = {
  ok: false
  error: string
  errorId: string
}

export async function actionErrorResult(
  error: unknown,
  fallback: string,
  context: ActionErrorContext,
): Promise<ActionErrorResult> {
  const errorId = await logActionError(error, context)
  return {
    ok: false,
    error: humanActionError(error, fallback),
    errorId,
  }
}

export async function logActionError(error: unknown, context: ActionErrorContext) {
  const session = await auth().catch(() => null)
  const h = await headers().catch(() => null)
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack ?? null : null
  const errorId = formatErrorId(`${context.source}:${context.route ?? ""}:${message}:${stack ?? ""}`)
  const decoded = decodeErrorReport({
    source: context.source,
    path: context.route,
    message,
    stack,
  })
  const ip = h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h?.get("x-real-ip") ?? null

  const payload = {
    errorId,
    source: context.source,
    path: context.route ?? null,
    message: clip(message, 1_000),
    stack: clip(stack, 4_000),
    userId: context.userId ?? session?.user?.id ?? null,
    userRole: session?.user?.role ?? null,
    organizationId: context.orgId ?? session?.user?.organizationId ?? null,
    routeKind: context.route?.startsWith("/superadmin")
      ? "superadmin"
      : context.route?.startsWith("/admin")
        ? "admin"
        : context.route?.startsWith("/cabinet")
          ? "cabinet"
          : "server-action",
    explanation: decoded.explanation,
    suggestedAction: decoded.suggestedAction,
    hints: decoded.hints,
    context: sanitizeContext(context.input ?? null),
    at: new Date().toISOString(),
    sentryEventId: null as string | null,
  }

  payload.sentryEventId = await captureServerException(error, {
    errorId,
    source: context.source,
    path: context.route ?? null,
    userId: payload.userId,
    userRole: payload.userRole,
    organizationId: payload.organizationId,
    routeKind: payload.routeKind,
    context: payload.context,
  })

  console.error("[server-action-error]", payload)

  await db.auditLog.create({
    data: {
      userId: payload.userId,
      userName: session?.user?.name ?? null,
      userRole: session?.user?.role ?? null,
      action: "ERROR",
      entity: context.entity ?? "server-action",
      entityId: context.entityId ?? errorId,
      details: JSON.stringify(payload),
      ip,
    },
  }).catch((auditError) => {
    console.error("[server-action-error/audit-log-failed]", {
      errorId,
      error: auditError instanceof Error ? auditError.message : String(auditError),
    })
  })

  return errorId
}

function humanActionError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : ""
  if (message && !message.includes("NEXT_REDIRECT")) return message
  return fallback
}

function clip(value: string | null, max: number): string | null {
  if (!value) return null
  return value.length > max ? `${value.slice(0, max)}...` : value
}

function sanitizeContext(input: Record<string, unknown> | null) {
  if (!input) return null
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (/password|token|secret|key|authorization|cookie/i.test(key)) {
      result[key] = "[redacted]"
      continue
    }
    if (typeof value === "string") {
      result[key] = value.length > 240 ? `${value.slice(0, 240)}...` : value
      continue
    }
    if (typeof value === "number" || typeof value === "boolean" || value === null) {
      result[key] = value
      continue
    }
    result[key] = String(value).slice(0, 240)
  }
  return result
}
