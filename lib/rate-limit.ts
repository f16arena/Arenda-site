// Простой in-memory rate limiter для server actions / API routes.
// Подходит для одного instance. На Vercel при масштабировании несколько
// инстансов будут считать независимо (что не идеально, но для базовой
// защиты от перебора достаточно).
//
// Использование:
//   const rl = checkRateLimit(`login:${ip}`, { max: 5, window: 60_000 })
//   if (!rl.ok) throw new Error(`Слишком много попыток. Попробуйте через ${rl.retryAfterSec}с`)

interface Bucket {
  count: number
  windowStart: number
}

const buckets = new Map<string, Bucket>()

// Периодическая чистка старых ключей чтобы Map не разрастался
let lastCleanup = Date.now()
function cleanup(now: number) {
  if (now - lastCleanup < 5 * 60_000) return
  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.windowStart > 60 * 60_000) {
      buckets.delete(key)
    }
  }
  lastCleanup = now
}

export interface RateLimitResult {
  ok: boolean
  /** Сколько попыток осталось в окне (если ok=true) */
  remaining: number
  /** Через сколько секунд можно повторить (если ok=false) */
  retryAfterSec: number
}

export function checkRateLimit(
  key: string,
  opts: { max: number; window: number },
): RateLimitResult {
  const now = Date.now()
  cleanup(now)

  let bucket = buckets.get(key)
  if (!bucket || now - bucket.windowStart >= opts.window) {
    bucket = { count: 0, windowStart: now }
    buckets.set(key, bucket)
  }

  bucket.count++

  if (bucket.count > opts.max) {
    const retryAfterMs = opts.window - (now - bucket.windowStart)
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    }
  }

  return {
    ok: true,
    remaining: opts.max - bucket.count,
    retryAfterSec: 0,
  }
}

/**
 * Получить идентификатор клиента из request headers.
 * Использует x-forwarded-for (Vercel) или fallback на user-agent.
 */
export function getClientKey(headers: Headers, suffix?: string): string {
  const ip =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? headers.get("x-real-ip")
    ?? headers.get("cf-connecting-ip")
    ?? "unknown"
  return suffix ? `${ip}:${suffix}` : ip
}
