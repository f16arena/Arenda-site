// Журнал открытий витрины, серверная часть: отпечаток посетителя. IP в открытом
// виде не храним — только необратимый хеш с солью из токена ссылки.

import { createHash } from "node:crypto"

/** Короткий необратимый отпечаток посетителя: соль — токен ссылки. */
export function visitorHash(ip: string | null, token: string): string | null {
  if (!ip) return null
  return createHash("sha256").update(`${token}:${ip}`).digest("hex").slice(0, 16)
}

/** Первый адрес из X-Forwarded-For (за прокси их может быть несколько). */
export function clientIp(headers: { get(name: string): string | null }): string | null {
  const fwd = headers.get("x-forwarded-for")
  if (fwd) {
    const first = fwd.split(",")[0]?.trim()
    if (first) return first
  }
  return headers.get("x-real-ip")
}

