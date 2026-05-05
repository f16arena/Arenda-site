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

export function sanitizeSentryEvent<T extends SentryLikeEvent>(event: T): T {
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

export function redactRecord<T extends Record<string, unknown> | undefined>(input: T): T {
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
