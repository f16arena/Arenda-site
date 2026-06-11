import "server-only"

/**
 * Справочник налогоплательщиков (КГД РК): поиск реквизитов по ИИН/БИН для
 * автозаполнения карточки арендатора (наименование, адрес, руководитель).
 *
 * Режим по умолчанию — официальный публичный API портала КГД
 * (portal.kgd.gov.kz/services/isnaportalsync/public/taxpayer-data). Для него
 * достаточно одной env-переменной KGD_API_KEY = персональный X-Portal-Token
 * (выдаётся на портале через «Создать обращение»). Ответ — формат
 * taxpayerPortalSearchResponses: статус регистрации, наименование/ФИО.
 * Адрес и руководителя этот API не отдаёт.
 *
 * Альтернативный источник (adata/kompra/data.egov и т.п.) — через env:
 *   KGD_API_URL        — URL запроса; «{taxId}» подставляется как ИИН/БИН,
 *                        «{taxpayerType}» (опционально) — как UL/IP.
 *   KGD_API_KEY        — ключ API.
 *   KGD_API_KEY_HEADER — имя заголовка для ключа (по умолчанию X-API-KEY,
 *                        для портала КГД — X-Portal-Token; для Bearer укажите
 *                        «Authorization», значение станет «Bearer <ключ>»).
 *
 * Парсер: сначала пробует формат портала КГД, затем толерантный поиск типовых
 * ключей (name/title/address/director…) на любом уровне вложенности JSON.
 */

export interface TaxpayerInfo {
  name: string | null
  address: string | null
  director: string | null
  /** Статус регистрации в КГД (вид регистрации, даты, орган) — для подсказки в UI */
  status: string | null
}

const KGD_PORTAL_URL =
  "https://portal.kgd.gov.kz/services/isnaportalsync/public/taxpayer-data?taxpayerCode={taxId}&taxpayerType={taxpayerType}"

export function kgdConfigured(): boolean {
  return !!(process.env.KGD_API_URL || process.env.KGD_API_KEY)
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

type PortalEntry = {
  errorMessage?: string | null
  messageResult?: string | null
  code?: string | null
  taxpayerType?: string | null
  fullName?: string | { lastName?: string; firstName?: string; middleName?: string } | null
  registrationType?: { ru?: string; kk?: string; en?: string } | string | null
  beginDate?: string | null
  endDate?: string | null
  additionalInfo?: string | null
  taxOrg?: string | null
}

function cleanStr(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  return s && s.toLowerCase() !== "null" ? s : null
}

/** Формат официального API портала КГД: { taxpayerPortalSearchResponses: [...] } */
function parseKgdPortal(data: unknown): TaxpayerInfo | null {
  const arr = (data as { taxpayerPortalSearchResponses?: unknown })?.taxpayerPortalSearchResponses
  if (!Array.isArray(arr) || arr.length === 0) return null
  const entries = arr as PortalEntry[]
  const entry = entries.find((e) => e && !cleanStr(e.errorMessage)) ?? entries[0]
  if (!entry) return null
  if (cleanStr(entry.errorMessage)) return null

  let name: string | null = null
  if (typeof entry.fullName === "string") {
    name = cleanStr(entry.fullName)
  } else if (entry.fullName && typeof entry.fullName === "object") {
    name = [entry.fullName.lastName, entry.fullName.firstName, entry.fullName.middleName]
      .map(cleanStr)
      .filter(Boolean)
      .join(" ") || null
  }

  const regType = typeof entry.registrationType === "object" && entry.registrationType
    ? cleanStr(entry.registrationType.ru)
    : cleanStr(entry.registrationType)
  const begin = cleanStr(entry.beginDate)
  const end = cleanStr(entry.endDate)
  const status = [
    regType,
    begin ? `на учёте с ${begin}` : null,
    end ? `снят с учёта ${end}` : null,
    cleanStr(entry.taxOrg) ? `орган: ${cleanStr(entry.taxOrg)}` : null,
    cleanStr(entry.additionalInfo),
  ].filter(Boolean).join(" · ")

  if (!name && !status) return null
  return { name, address: null, director: null, status: status || null }
}

function buildUrl(urlTemplate: string, taxId: string, taxpayerType: string): string {
  let url = urlTemplate.includes("{taxId}")
    ? urlTemplate.replaceAll("{taxId}", taxId)
    : urlTemplate.endsWith("=") || urlTemplate.endsWith("/")
      ? `${urlTemplate}${taxId}`
      : `${urlTemplate}/${taxId}`
  url = url.replaceAll("{taxpayerType}", taxpayerType)
  return url
}

export async function lookupTaxpayer(
  taxIdRaw: string,
  /** Подсказка от формы: БИН (юрлицо) или ИИН (ИП/частная практика). Влияет на порядок перебора taxpayerType. */
  kind: "UL" | "IP" = "UL",
): Promise<{ ok: true; info: TaxpayerInfo } | { ok: false; error: string }> {
  const taxId = String(taxIdRaw ?? "").replace(/\D/g, "")
  if (taxId.length !== 12) return { ok: false, error: "ИИН/БИН должен содержать 12 цифр" }

  const key = process.env.KGD_API_KEY
  const urlTemplate = process.env.KGD_API_URL || (key ? KGD_PORTAL_URL : null)
  if (!urlTemplate) {
    return {
      ok: false,
      error: "Справочник КГД не настроен: добавьте KGD_API_KEY (X-Portal-Token портала КГД) в переменные окружения",
    }
  }
  const usesPortal = urlTemplate.includes("portal.kgd.gov.kz")

  const headers: Record<string, string> = { Accept: "application/json" }
  if (key) {
    const headerName = process.env.KGD_API_KEY_HEADER || (usesPortal ? "X-Portal-Token" : "X-API-KEY")
    headers[headerName] = headerName.toLowerCase() === "authorization" ? `Bearer ${key}` : key
  }

  // Если URL различает тип налогоплательщика — пробуем сначала подсказанный формой,
  // затем альтернативный (вдруг под ИИН зарегистрировано ИП, а ввели как юрлицо).
  const types = urlTemplate.includes("{taxpayerType}")
    ? (kind === "UL" ? ["UL", "IP"] : ["IP", "UL"])
    : ["UL"]

  let lastError = "Налогоплательщик с таким ИИН/БИН не найден"
  for (const taxpayerType of types) {
    const url = buildUrl(urlTemplate, taxId, taxpayerType)
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000), cache: "no-store" })
      if (!res.ok) {
        if (res.status === 404) continue
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          lastError = usesPortal
            ? `Портал КГД отклонил запрос (${res.status}): проверьте X-Portal-Token (env KGD_API_KEY)`
            : `Справочник ответил ошибкой ${res.status}`
          continue
        }
        lastError = `Справочник ответил ошибкой ${res.status}`
        continue
      }
      const data = (await res.json()) as unknown

      const portal = parseKgdPortal(data)
      if (portal) return { ok: true, info: portal }

      const info: TaxpayerInfo = {
        name: findString(data, NAME_KEYS),
        address: findString(data, ADDRESS_KEYS),
        director: findString(data, DIRECTOR_KEYS),
        status: null,
      }
      if (info.name || info.address) return { ok: true, info }

      console.warn("[kgd] ответ получен, но поля не распознаны:", JSON.stringify(data).slice(0, 500))
      lastError = "Ответ справочника не распознан — пришлите пример ответа, поправим маппинг"
    } catch (e) {
      lastError = e instanceof Error && e.name === "TimeoutError"
        ? "Справочник не ответил за 8 секунд"
        : `Не удалось запросить справочник: ${e instanceof Error ? e.message : "сетевая ошибка"}`
    }
  }
  return { ok: false, error: lastError }
}
