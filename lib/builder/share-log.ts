// Журнал открытий витрины: разбор данных для показа владельцу. Здесь только
// чистые функции — файл попадает в браузерный бандл, node-модулей быть не может.

/**
 * Браузер посетителя коротко: длинный UA в журнале не нужен. Названия браузеров
 * и систем — имена собственные, их не переводят; «Браузер» для неизвестного и
 * пометку «телефон» подставляет вызывающий (adminBuilder.share).
 */
export function shortAgent(ua: string | null, words?: { unknown: string; phone: string }): string | null {
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
              : words?.unknown ?? "Браузер"
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : ""
  return `${browser}${os ? ` · ${os}` : ""}${mobile ? ` · ${words?.phone ?? "телефон"}` : ""}`
}

/**
 * Когда витрину открывали последний раз: «18.09 в 14:22» на языке интерфейса.
 * Само «3 открытия, последнее …» собирает панель — там есть склонения и tp().
 */
export function lastViewAt(locale: string, last: Date | string | null): string {
  if (!last) return ""
  const d = new Date(last)
  return `${d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })} ${d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}`
}
