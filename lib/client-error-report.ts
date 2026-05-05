"use client"

type ReportClientErrorInput = {
  errorId: string
  source: string
  pathname?: string | null
  error: Error & { digest?: string }
}

export function reportClientError({ errorId, source, pathname, error }: ReportClientErrorInput) {
  const context = typeof window !== "undefined"
    ? {
        language: window.navigator.language,
        online: window.navigator.onLine,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      }
    : null

  console.error(`[${source}] Ошибка #${errorId}`, {
    pathname,
    message: error.message,
    digest: error.digest,
    stack: error.stack,
  })

  void (async () => {
    const sentryEventId = await captureClientException({ errorId, source, pathname, error, context })

    fetch("/api/errors/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        errorId,
        source,
        path: pathname ?? null,
        message: error.message,
        digest: error.digest ?? null,
        stack: error.stack ?? null,
        href: typeof window !== "undefined" ? window.location.href : null,
        sentryEventId,
        context,
      }),
    }).catch(() => undefined)
  })()
}

async function captureClientException({
  errorId,
  source,
  pathname,
  error,
  context,
}: ReportClientErrorInput & { context: Record<string, unknown> | null }): Promise<string | null> {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return null

  try {
    const Sentry = await import("@sentry/nextjs")
    return Sentry.withScope((scope) => {
      scope.setTag("error_id", errorId)
      scope.setTag("source", source)
      if (pathname) scope.setTag("path", pathname)
      if (error.digest) scope.setTag("digest", error.digest)
      scope.setContext("commrent", {
        errorId,
        source,
        path: pathname ?? null,
        digest: error.digest ?? null,
        context,
      })
      return Sentry.captureException(error)
    })
  } catch {
    return null
  }
}
