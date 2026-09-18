// Журнал открытий витрины. IP посетителя не храним в открытом виде: считаем от
// него необратимый хеш с солью проекта — по нему видно, что это один и тот же
// посетитель заходил трижды, но восстановить адрес нельзя.

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

/** Браузер посетителя коротко: длинный UA в журнале не нужен. */
export function shortAgent(ua: string | null): string | null {
  if (!ua) return null
  const mobile = /Mobile|Android|iPhone|iPad/i.test(ua)
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /YaBrowser/.test(ua)
        ? "Яндекс"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Браузер"
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : ""
  return `${browser}${os ? ` · ${os}` : ""}${mobile ? " · телефон" : ""}`
}

/** «3 открытия, последнее 18.09 в 14:22» — строка для панели «Поделиться». */
export function viewsSummary(count: number, last: Date | string | null): string {
  if (!count) return "ещё не открывали"
  const d = last ? new Date(last) : null
  const when = d
    ? `${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })} в ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
    : ""
  const word = count % 10 === 1 && count % 100 !== 11 ? "открытие" : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20) ? "открытия" : "открытий"
  return `${count} ${word}${when ? `, последнее ${when}` : ""}`
}
