import Constants from "expo-constants"
import * as Sentry from "@sentry/react-native"

let initialized = false

type SentryLikeEvent = {
  user?: Record<string, unknown>
  request?: {
    cookies?: unknown
    data?: unknown
    headers?: Record<string, unknown>
  }
  extra?: Record<string, unknown>
}

const SENSITIVE_KEY = /password|token|secret|authorization|cookie|set-cookie|api[-_]?key|session/i

export function initMobileSentry() {
  if (initialized) return
  initialized = true

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN
  if (!dsn) return

  const tracesSampleRate = Number(process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.05")

  Sentry.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? "development",
    release: process.env.EXPO_PUBLIC_APP_VERSION ?? Constants.expoConfig?.version,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.05,
    sendDefaultPii: false,
    enableAutoSessionTracking: true,
    enableCaptureFailedRequests: true,
    beforeSend(event) {
      return sanitizeSentryEvent(event)
    },
  })
}

export function setMobileSentryUser(user: { id: string; role?: string | null; organizationId?: string | null } | null) {
  if (!process.env.EXPO_PUBLIC_SENTRY_DSN) return
  if (!user) {
    Sentry.setUser(null)
    return
  }

  Sentry.setUser({ id: user.id })
  Sentry.setTag("role", user.role ?? "unknown")
  if (user.organizationId) Sentry.setTag("organization_id", user.organizationId)
}

export function captureMobileException(error: unknown, extra?: Record<string, unknown>) {
  if (!process.env.EXPO_PUBLIC_SENTRY_DSN) return
  Sentry.captureException(error, { extra: redactRecord(extra) })
}

function sanitizeSentryEvent<T extends SentryLikeEvent>(event: T): T {
  if (event.user) {
    delete event.user.email
    delete event.user.ip_address
  }

  if (event.request) {
    delete event.request.cookies
    event.request.headers = redactRecord(event.request.headers)
    event.request.data = redactValue(event.request.data)
  }

  event.extra = redactRecord(event.extra)
  return event
}

function redactRecord<T extends Record<string, unknown> | undefined>(input: T): T {
  if (!input) return input
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    output[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redactValue(value)
  }
  return output as T
}

function redactValue(value: unknown): unknown {
  if (!value || typeof value !== "object") return value
  if (Array.isArray(value)) return value.map(redactValue)

  const output: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redactValue(nested)
  }
  return output
}
