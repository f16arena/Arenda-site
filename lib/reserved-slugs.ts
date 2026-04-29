// Slug'и, которые нельзя отдавать клиентам как поддомены — они нужны
// для системных нужд платформы.
export const RESERVED_SLUGS = new Set<string>([
  // Корневой и canonical
  "www",
  "commrent",
  // Платформенные интерфейсы
  "admin",
  "superadmin",
  "auth",
  "login",
  "signup",
  "dashboard",
  "billing",
  // Технические
  "api",
  "app",
  "cdn",
  "static",
  "assets",
  "media",
  "files",
  "ftp",
  // Почта и DNS
  "mail",
  "smtp",
  "imap",
  "pop",
  "ns1",
  "ns2",
  "mx",
  // Контентные
  "help",
  "support",
  "docs",
  "blog",
  "status",
  "kb",
])

const SLUG_FORMAT = /^[a-z0-9](?:[a-z0-9-]{3,18}[a-z0-9])$/

/**
 * Проверяет slug:
 * - 5–20 символов
 * - латиница нижнего регистра, цифры, дефис
 * - не начинается/заканчивается дефисом
 * - не входит в список зарезервированных
 */
export function validateSlug(slug: string): { ok: true } | { ok: false; reason: string } {
  if (!slug) return { ok: false, reason: "Slug пустой" }
  if (slug.length < 5 || slug.length > 20) {
    return { ok: false, reason: "Длина slug — от 5 до 20 символов" }
  }
  if (!SLUG_FORMAT.test(slug)) {
    return { ok: false, reason: "Только латиница нижнего регистра, цифры и дефис; не должен начинаться или заканчиваться дефисом" }
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, reason: `Имя «${slug}» зарезервировано платформой` }
  }
  return { ok: true }
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase())
}
