import "server-only"

/**
 * Справочник налогоплательщиков (КГД РК): поиск реквизитов по ИИН/БИН для
 * автозаполнения карточки арендатора (наименование, адрес, руководитель).
 *
 * Конфигурация через env (Vercel):
 *   KGD_API_URL        — URL запроса; «{taxId}» подставляется как ИИН/БИН.
 *                        Пример: https://api.example.kz/taxpayer/{taxId}
 *                        Если плейсхолдера нет — ИИН/БИН добавится в конец URL.
 *   KGD_API_KEY        — ключ API (опционально).
 *   KGD_API_KEY_HEADER — имя заголовка для ключа (по умолчанию X-API-KEY;
 *                        для Bearer укажите «Authorization», значение станет
 *                        «Bearer <ключ>» автоматически).
 *
 * Парсер ответа толерантный: ищет типовые ключи (name/title/address/director…)
 * на любом уровне вложенности JSON — большинство справочных API подходят без
 * доработки. Если ваш ответ не распознаётся — пришлите пример, поправим маппинг.
 */

export interface TaxpayerInfo {
  name: string | null
  address: string | null
  director: string | null
}

export function kgdConfigured(): boolean {
  return !!process.env.KGD_API_URL
}

const NAME_KEYS = ["fullname", "name_ru", "nameru", "name", "title", "taxpayername", "shortname", "company_name", "companyname"]
const ADDRESS_KEYS = ["legal_address", "legaladdress", "registration_address", "registrationaddress", "address_ru", "addressru", "address"]
const DIRECTOR_KEYS = ["director_name", "directorname", "director", "head", "leader", "fio", "ceo"]

/** Рекурсивный поиск первого строкового значения по списку ключей (без регистра). */
function findString(value: unknown, keys: string[], depth = 0): string | null {
  if (depth > 4 || value === null || typeof value !== "object") return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findString(item, keys, depth + 1)
      if (found) return found
    }
    return null
  }
  const obj = value as Record<string, unknown>
  // Сначала прямое совпадение ключа на текущем уровне (в порядке приоритета keys).
  for (const key of keys) {
    for (const [k, v] of Object.entries(obj)) {
      if (k.toLowerCase() === key && typeof v === "string" && v.trim().length > 1) return v.trim()
    }
  }
  for (const v of Object.values(obj)) {
    const found = findString(v, keys, depth + 1)
    if (found) return found
  }
  return null
}

export async function lookupTaxpayer(
  taxIdRaw: string,
): Promise<{ ok: true; info: TaxpayerInfo } | { ok: false; error: string }> {
  const taxId = String(taxIdRaw ?? "").replace(/\D/g, "")
  if (taxId.length !== 12) return { ok: false, error: "ИИН/БИН должен содержать 12 цифр" }

  const urlTemplate = process.env.KGD_API_URL
  if (!urlTemplate) {
    return { ok: false, error: "Справочник КГД не настроен: добавьте KGD_API_URL (и KGD_API_KEY) в переменные окружения" }
  }
  const url = urlTemplate.includes("{taxId}")
    ? urlTemplate.replaceAll("{taxId}", taxId)
    : urlTemplate.endsWith("=") || urlTemplate.endsWith("/")
      ? `${urlTemplate}${taxId}`
      : `${urlTemplate}/${taxId}`

  const headers: Record<string, string> = { Accept: "application/json" }
  const key = process.env.KGD_API_KEY
  if (key) {
    const headerName = process.env.KGD_API_KEY_HEADER || "X-API-KEY"
    headers[headerName] = headerName.toLowerCase() === "authorization" ? `Bearer ${key}` : key
  }

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000), cache: "no-store" })
    if (!res.ok) {
      if (res.status === 404) return { ok: false, error: "Налогоплательщик с таким ИИН/БИН не найден" }
      return { ok: false, error: `Справочник ответил ошибкой ${res.status}` }
    }
    const data = (await res.json()) as unknown
    const info: TaxpayerInfo = {
      name: findString(data, NAME_KEYS),
      address: findString(data, ADDRESS_KEYS),
      director: findString(data, DIRECTOR_KEYS),
    }
    if (!info.name && !info.address) {
      console.warn("[kgd] ответ получен, но поля не распознаны:", JSON.stringify(data).slice(0, 500))
      return { ok: false, error: "Ответ справочника не распознан — пришлите пример ответа, поправим маппинг" }
    }
    return { ok: true, info }
  } catch (e) {
    const msg = e instanceof Error && e.name === "TimeoutError" ? "Справочник не ответил за 8 секунд" : e instanceof Error ? e.message : "Сетевая ошибка"
    return { ok: false, error: `Не удалось запросить справочник: ${msg}` }
  }
}
