import * as Sentry from "@sentry/nextjs"
import { sanitizeSentryEvent } from "@/lib/sentry-sanitize"

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
const tracesSampleRate = Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.05")

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_APP_VERSION,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.05,
    sendDefaultPii: false,
    enableLogs: true,
    ignoreErrors: [
      // Browser extensions / ad blockers / network noise
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
      "Network request failed",
      "Failed to fetch",
      "Load failed",
      "AbortError",
      "TimeoutError",
      "NEXT_NOT_FOUND",
      "NEXT_REDIRECT",
      // Hydration mismatches от расширений браузера
      /hydrat/i,
      // Третьи стороны
      /chrome-extension/,
      /moz-extension/,
    ],
    beforeSend(event) {
      return sanitizeSentryEvent(event)
    },
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
