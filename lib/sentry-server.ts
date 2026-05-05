import "server-only"

import { redactRecord } from "@/lib/sentry-sanitize"

type CaptureContext = {
  errorId: string
  source: string
  path?: string | null
  userId?: string | null
  userRole?: string | null
  organizationId?: string | null
  routeKind?: string | null
  context?: Record<string, unknown> | null
}

export async function captureServerException(error: unknown, context: CaptureContext): Promise<string | null> {
  if (!process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN) return null

  try {
    const Sentry = await import("@sentry/nextjs")
    const exception = error instanceof Error ? error : new Error(String(error))
    return Sentry.withScope((scope) => {
      scope.setTag("error_id", context.errorId)
      scope.setTag("source", context.source)
      if (context.path) scope.setTag("path", context.path)
      if (context.routeKind) scope.setTag("route_kind", context.routeKind)
      if (context.organizationId) scope.setTag("organization_id", context.organizationId)
      if (context.userId || context.userRole) {
        scope.setUser({
          id: context.userId ?? undefined,
          role: context.userRole ?? undefined,
        })
      }
      scope.setContext("commrent", redactRecord({
        errorId: context.errorId,
        source: context.source,
        path: context.path ?? null,
        routeKind: context.routeKind ?? null,
        organizationId: context.organizationId ?? null,
        context: context.context ?? null,
      }))
      return Sentry.captureException(exception)
    })
  } catch (captureError) {
    console.error("[sentry/capture-failed]", {
      errorId: context.errorId,
      error: captureError instanceof Error ? captureError.message : String(captureError),
    })
    return null
  }
}
