import * as Sentry from "@sentry/nextjs"
import { sanitizeSentryEvent } from "@/lib/sentry-sanitize"

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.05")

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA || process.env.APP_VERSION,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.05,
    sendDefaultPii: false,
    enableLogs: true,
    beforeSend(event) {
      return sanitizeSentryEvent(event)
    },
  })
}
