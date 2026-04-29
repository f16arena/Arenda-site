import { isReservedSlug } from "./reserved-slugs"

/**
 * Корневой домен платформы. На preview/локалке может быть другой.
 * Берётся из env, fallback на commrent.kz.
 */
export const ROOT_HOST = process.env.ROOT_HOST || "commrent.kz"

/**
 * Извлекает slug организации из host-заголовка.
 *
 * Возвращает:
 * - "root"       — пользователь на корневом домене (commrent.kz, www.commrent.kz)
 * - "external"   — это не наш домен (например vercel preview, ip, custom)
 *                  → relax-режим: трактуем как root, не пытаемся резолвить slug
 * - { slug }     — найден поддомен валидного формата (5-20 chars)
 * - "reserved"   — поддомен зарезервирован системой (api, www, admin...)
 * - "invalid"    — поддомен некорректного формата (короткий/длинный/символы)
 */
export type HostInfo =
  | { kind: "root" }
  | { kind: "external" }
  | { kind: "subdomain"; slug: string }
  | { kind: "reserved"; slug: string }
  | { kind: "invalid"; raw: string }

export function parseHost(rawHost: string | null | undefined): HostInfo {
  if (!rawHost) return { kind: "external" }

  // Убираем порт (localhost:3000 → localhost)
  const host = rawHost.split(":")[0].toLowerCase().trim()
  if (!host) return { kind: "external" }

  // Локалка / preview / IP
  if (host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return { kind: "external" }
  }

  // Корневой домен
  if (host === ROOT_HOST || host === `www.${ROOT_HOST}`) {
    return { kind: "root" }
  }

  // Поддомен корневого
  if (host.endsWith(`.${ROOT_HOST}`)) {
    const slug = host.slice(0, -(ROOT_HOST.length + 1))

    // Многоуровневые поддомены (a.b.commrent.kz) — отвергаем
    if (slug.includes(".")) return { kind: "invalid", raw: host }

    if (isReservedSlug(slug)) return { kind: "reserved", slug }

    // Минимальные требования формата (валидация полная — на регистрации)
    if (!/^[a-z0-9][a-z0-9-]{3,18}[a-z0-9]$/.test(slug)) {
      return { kind: "invalid", raw: host }
    }

    return { kind: "subdomain", slug }
  }

  // Чужой домен (vercel preview, ngrok)
  return { kind: "external" }
}
