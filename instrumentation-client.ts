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
    beforeSend(event) {
      return sanitizeSentryEvent(event)
    },
  })
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
