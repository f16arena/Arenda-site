import { timingSafeEqual } from "crypto"

export function authorizeCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error("[cron] CRON_SECRET is not configured")
    return false
  }

  const auth = req.headers.get("authorization") ?? ""
  const prefix = "Bearer "
  if (!auth.startsWith(prefix)) return false

  const token = auth.slice(prefix.length)
  return safeEqual(token, secret)
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}
