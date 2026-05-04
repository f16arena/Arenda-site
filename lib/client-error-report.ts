"use client"

type ReportClientErrorInput = {
  errorId: string
  source: string
  pathname?: string | null
  error: Error & { digest?: string }
}

export function reportClientError({ errorId, source, pathname, error }: ReportClientErrorInput) {
  console.error(`[${source}] Ошибка #${errorId}`, {
    pathname,
    message: error.message,
    digest: error.digest,
    stack: error.stack,
  })

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
      context: typeof window !== "undefined"
        ? {
            language: window.navigator.language,
            online: window.navigator.onLine,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
          }
        : null,
    }),
  }).catch(() => undefined)
}
