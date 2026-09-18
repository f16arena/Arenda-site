// Журнал открытий витрины: разбор данных для показа владельцу. Здесь только
// чистые функции — файл попадает в браузерный бандл, node-модулей быть не может.

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
