type Bucket = {
  count: number
  resetAt: number
}

const WINDOW_MS = 10 * 60_000
const MAX_ATTEMPTS = 8

const store = new Map<string, Bucket>()

export function checkMobileAuthRateLimit(key: string) {
  const now = Date.now()
  const bucket = store.get(key)

  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 0, resetAt: now + WINDOW_MS })
    return { ok: true, retryAfterSeconds: 0 }
  }

  if (bucket.count >= MAX_ATTEMPTS) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    }
  }

  return { ok: true, retryAfterSeconds: 0 }
}

export function recordMobileAuthFailure(key: string) {
  const now = Date.now()
  const bucket = store.get(key)
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return
  }

  bucket.count += 1
}

export function clearMobileAuthFailures(key: string) {
  store.delete(key)
}
