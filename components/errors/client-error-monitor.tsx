"use client"

import { useEffect } from "react"
import { formatErrorId } from "@/lib/error-id"
import { reportClientError } from "@/lib/client-error-report"

export function ClientErrorMonitor() {
  useEffect(() => {
    const seen = new Set<string>()

    const report = (source: string, error: Error & { digest?: string }) => {
      const fingerprint = `${source}:${error.name}:${error.message}:${error.stack ?? ""}`.slice(0, 500)
      if (seen.has(fingerprint)) return
      seen.add(fingerprint)
      if (seen.size > 80) seen.clear()

      reportClientError({
        errorId: formatErrorId(error.digest ?? fingerprint),
        source,
        pathname: window.location.pathname,
        error,
      })
    }

    const onError = (event: ErrorEvent) => {
      const error = event.error instanceof Error
        ? event.error
        : new Error(event.message || "Unhandled browser error")
      if (!error.stack && event.filename) {
        error.stack = `${event.filename}:${event.lineno}:${event.colno}`
      }
      report("client/window-error", error)
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const error = reason instanceof Error
        ? reason
        : new Error(typeof reason === "string" ? reason : "Unhandled promise rejection")
      report("client/unhandled-rejection", error)
    }

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onUnhandledRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onUnhandledRejection)
    }
  }, [])

  return null
}
