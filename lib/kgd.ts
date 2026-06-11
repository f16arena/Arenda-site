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
 * Второй источник — ГБД «Юридические лица» Минюста через data.egov.kz
 * (env DATA_EGOV_API_KEY, бесплатный ключ после регистрации на портале):
 * доливает юр. адрес и ФИО руководителя, которых нет в ответе КГД.
 *
 * Альтернативный источник вместо КГД (adata/kompra и т.п.) — через env:
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
  /** Тип налогоплательщика из ответа КГД — для автовыбора правовой формы */
  taxpayerType: "UL" | "IP" | "LZCHP" | null
  /** Вид частной практики (NOTARY/ADVOCATE/PRIVATE_BAILIFF…) при taxpayerType=LZCHP */
  lzchpType: string | null
  /** Состоит ли на учёте по НДС (null — источник не ответил/не поддерживает) */
  vatPayer: boolean | null
  /** Человекочитаемый НДС-статус («Плательщик НДС с …» / «Снят с учёта НДС …») */
  vatStatus: string | null
}

// print=false — обязательный по инструкции КГД параметр (false = JSON, true = PDF base64)
const KGD_PORTAL_URL =
  "https://portal.kgd.gov.kz/services/isnaportalsync/public/taxpayer-data?taxpayerCode={taxId}&taxpayerType={taxpayerType}&print=false"
// Сервис КГД «Поиск плательщиков НДС» (тот же X-Portal-Token)
const KGD_NDS_URL =
  "https://portal.kgd.gov.kz/services/isnaportalsync/public/search-payer-data?taxpayerCode="

export function kgdConfigured(): boolean {
  return !!(process.env.KGD_API_URL || process.env.KGD_API_KEY || process.env.DATA_EGOV_API_KEY)
}

const NAME_KEYS = ["fullname", "name_ru", "nameru", "name", "title", "taxpayername", "shortname", "company_name", "companyname"]
const ADDRESS_KEYS = ["legal_address", "legaladdress", "registration_address", "registrationaddress", "address_ru", "addressru", "law_address", "lawaddress", "address"]
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

type PortalEndReason = { code?: string | null; ru?: string | null; en?: string | null } | null
type PortalEntry = {
  errorMessage?: string | null
  messageResult?: string | null
  code?: string | null
  taxpayerType?: string | null
  /** ЮЛ и ИП: наименование/ФИО строкой */
  name?: string | null
  /** ЛЗЧП (нотариус/адвокат/ЧСИ): ФИО объектом */
  fullName?: { lastName?: string | null; firstName?: string | null; middleName?: string | null } | string | null
  beginDate?: string | null
  endDate?: string | null
  endReason?: PortalEndReason
  lzchpTypes?: Array<{
    lzchpType?: string | null
    beginDate?: string | null
    endDate?: string | null
    endReason?: PortalEndReason
  }> | null
}

function cleanStr(v: unknown): string | null {
  if (typeof v !== "string") return null
  const s = v.trim()
  return s && s.toLowerCase() !== "null" ? s : null
}

/** "2022-01-05" → "05.01.2022" (иначе — как есть) */
function fmtDate(v: string | null): string | null {
  if (!v) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : v
}

const TAXPAYER_TYPE_RU: Record<string, string> = { UL: "Юрлицо", IP: "ИП", LZCHP: "Частная практика" }
const LZCHP_TYPE_RU: Record<string, string> = {
  NOTARY: "Нотариус",
  ADVOCATE: "Адвокат",
  LAWYER: "Адвокат",
  PRIVATE_BAILIFF: "Частный судебный исполнитель",
  CHSI: "Частный судебный исполнитель",
  MEDIATOR: "Медиатор",
}

/** «на учёте с …» / «снят с учёта … — Ликвидация» */
function registrationSpan(begin: string | null, end: string | null, endReason: PortalEndReason): string | null {
  if (end) {
    const reason = cleanStr(endReason?.ru)
    return `снят с учёта ${fmtDate(end)}${reason ? ` — ${reason}` : ""}`
  }
  if (begin) return `действующий, на учёте с ${fmtDate(begin)}`
  return null
}

/** Формат официального API портала КГД: { taxpayerPortalSearchResponses: [...] } */
function parseKgdPortal(data: unknown): TaxpayerInfo | null {
  const arr = (data as { taxpayerPortalSearchResponses?: unknown })?.taxpayerPortalSearchResponses
  if (!Array.isArray(arr) || arr.length === 0) return null
  const entries = arr as PortalEntry[]
  const ok = (e: PortalEntry | undefined) => {
    if (!e || cleanStr(e.errorMessage)) return false
    const result = cleanStr(e.messageResult)
    return !result || result.toUpperCase() === "SUCCESS"
  }
  const entry = entries.find(ok)
  if (!entry) return null

  // ЮЛ/ИП — name строкой; ЛЗЧП — fullName объектом (Фамилия Имя Отчество)
  let name = cleanStr(entry.name)
  if (!name && typeof entry.fullName === "string") name = cleanStr(entry.fullName)
  if (!name && entry.fullName && typeof entry.fullName === "object") {
    name = [entry.fullName.lastName, entry.fullName.firstName, entry.fullName.middleName]
      .map(cleanStr)
      .filter(Boolean)
      .join(" ") || null
  }

  const bits: Array<string | null> = [TAXPAYER_TYPE_RU[cleanStr(entry.taxpayerType)?.toUpperCase() ?? ""] ?? null]
  const lzchp = Array.isArray(entry.lzchpTypes) ? entry.lzchpTypes : []
  if (lzchp.length > 0) {
    // У ЛЗЧП может быть несколько регистраций (нотариус + медиатор) — показываем все
    for (const t of lzchp) {
      const label = LZCHP_TYPE_RU[cleanStr(t.lzchpType)?.toUpperCase() ?? ""] ?? cleanStr(t.lzchpType)
      const span = registrationSpan(cleanStr(t.beginDate), cleanStr(t.endDate), t.endReason ?? null)
      bits.push([label, span].filter(Boolean).join(": "))
    }
  } else {
    bits.push(registrationSpan(cleanStr(entry.beginDate), cleanStr(entry.endDate), entry.endReason ?? null))
  }
  const status = bits.filter(Boolean).join(" · ")

  if (!name && !status) return null
  const typeRaw = cleanStr(entry.taxpayerType)?.toUpperCase() ?? null
  return {
    name,
    address: null,
    director: null,
    status: status || null,
    taxpayerType: typeRaw === "UL" || typeRaw === "IP" || typeRaw === "LZCHP" ? typeRaw : null,
    lzchpType: lzchp.length > 0 ? cleanStr(lzchp[0]?.lzchpType) : null,
    vatPayer: null,
    vatStatus: null,
  }
}

/**
 * НДС-статус из сервиса КГД «Поиск плательщиков НДС».
 * Плательщик = есть дата постановки и нет более поздней даты снятия.
 * null — сервис не ответил (статус неизвестен, галочку не трогаем).
 */
async function lookupNdsStatus(
  taxId: string,
  headers: Record<string, string>,
): Promise<{ vatPayer: boolean; vatStatus: string } | null> {
  try {
    const res = await fetch(`${KGD_NDS_URL}${taxId}`, {
      headers,
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    })
    if (res.status === 404) {
      return { vatPayer: false, vatStatus: "Не состоит на учёте по НДС" }
    }
    if (!res.ok) return null
    const data = (await res.json()) as {
      ndsRegistrationDate?: string | null
      ndsDeregistrationDate?: string | null
      ndsDeregistrationReason?: { ru?: string | null } | null
    } | null
    if (!data || typeof data !== "object") return null
    const reg = cleanStr(data.ndsRegistrationDate)
    const dereg = cleanStr(data.ndsDeregistrationDate)
    if (!reg && !dereg) {
      return { vatPayer: false, vatStatus: "Не состоит на учёте по НДС" }
    }
    // Снятие позже постановки → сейчас НЕ плательщик
    const active = !!reg && (!dereg || new Date(dereg).getTime() < new Date(reg).getTime())
    if (active) {
      return { vatPayer: true, vatStatus: `Плательщик НДС с ${fmtDate(reg)}` }
    }
    const reason = cleanStr(data.ndsDeregistrationReason?.ru)
    return {
      vatPayer: false,
      vatStatus: `Снят с учёта НДС ${fmtDate(dereg) ?? ""}${reason ? ` — ${reason}` : ""}`.trim(),
    }
  } catch {
    return null
  }
}

/**
 * ГБД «Юридические лица» Минюста (data.egov.kz, датасет gbd_ul): юр. адрес и
 * ФИО руководителя по БИН. Бесплатный apiKey — env DATA_EGOV_API_KEY.
 * ИП/частной практики в ГБД ЮЛ нет — только юрлица, филиалы, представительства.
 */
async function lookupEgovUl(taxId: string): Promise<Pick<TaxpayerInfo, "name" | "address" | "director"> | null> {
  const apiKey = process.env.DATA_EGOV_API_KEY
  if (!apiKey) return null
  const source = encodeURIComponent(JSON.stringify({ size: 5, query: { match: { bin: taxId } } }))
  const url = `https://data.egov.kz/api/v4/gbd_ul/v1?apiKey=${apiKey}&source=${source}`
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" })
    if (!res.ok) {
      console.warn(`[kgd] data.egov.kz ответил ${res.status}`)
      return null
    }
    const data = (await res.json()) as unknown
    const rows = Array.isArray(data) ? data : (data as { data?: unknown })?.data
    if (!Array.isArray(rows) || rows.length === 0) return null
    // match-запрос нестрогий — берём запись с точным совпадением БИН
    const rec = rows.find((r) => {
      const bin = (r as Record<string, unknown>)?.bin
      return typeof bin === "string" && bin.replace(/\D/g, "") === taxId
    }) ?? rows[0]
    if (!rec || typeof rec !== "object") return null
    return {
      name: findString(rec, NAME_KEYS),
      address: findString(rec, ADDRESS_KEYS),
      director: findString(rec, DIRECTOR_KEYS),
    }
  } catch (e) {
    console.warn("[kgd] data.egov.kz недоступен:", e instanceof Error ? e.message : e)
    return null
  }
}

/** Долить из ГБД ЮЛ адрес/директора, которых не даёт КГД (только для юрлиц). */
async function enrichWithEgov(info: TaxpayerInfo, taxId: string): Promise<TaxpayerInfo> {
  if (info.address && info.director) return info
  if (info.taxpayerType && info.taxpayerType !== "UL") return info
  const egov = await lookupEgovUl(taxId)
  if (!egov) return info
  return {
    ...info,
    name: info.name ?? egov.name,
    address: info.address ?? egov.address,
    director: info.director ?? egov.director,
  }
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

export type TaxpayerKind = "UL" | "IP" | "LZCHP"

export async function lookupTaxpayer(
  taxIdRaw: string,
  /** Подсказка от формы: БИН (юрлицо), ИИН (ИП) или частная практика (нотариус/адвокат/ЧСИ). Влияет на порядок перебора taxpayerType. */
  kind: TaxpayerKind = "UL",
): Promise<{ ok: true; info: TaxpayerInfo } | { ok: false; error: string }> {
  const taxId = String(taxIdRaw ?? "").replace(/\D/g, "")
  if (taxId.length !== 12) return { ok: false, error: "ИИН/БИН должен содержать 12 цифр" }

  const key = process.env.KGD_API_KEY
  const urlTemplate = process.env.KGD_API_URL || (key ? KGD_PORTAL_URL : null)
  if (!urlTemplate) {
    // Без КГД, но с ключом data.egov.kz — ищем только в ГБД ЮЛ
    if (process.env.DATA_EGOV_API_KEY && kind === "UL") {
      const egov = await lookupEgovUl(taxId)
      if (egov && (egov.name || egov.address)) {
        return { ok: true, info: { ...egov, status: null, taxpayerType: "UL", lzchpType: null, vatPayer: null, vatStatus: null } }
      }
      return { ok: false, error: "Юрлицо с таким БИН не найдено в ГБД ЮЛ" }
    }
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

  // НДС-статус — параллельно с основным поиском (отдельный сервис портала КГД)
  const ndsPromise = usesPortal ? lookupNdsStatus(taxId, headers) : Promise.resolve(null)

  // Если URL различает тип налогоплательщика — пробуем сначала подсказанный формой,
  // затем альтернативные (вдруг под ИИН зарегистрировано ИП, а ввели как юрлицо).
  const types = urlTemplate.includes("{taxpayerType}")
    ? kind === "UL" ? ["UL", "IP"] : kind === "LZCHP" ? ["LZCHP", "IP"] : ["IP", "UL"]
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
      if (portal) {
        const [enriched, nds] = await Promise.all([enrichWithEgov(portal, taxId), ndsPromise])
        return { ok: true, info: { ...enriched, vatPayer: nds?.vatPayer ?? null, vatStatus: nds?.vatStatus ?? null } }
      }

      const info: TaxpayerInfo = {
        name: findString(data, NAME_KEYS),
        address: findString(data, ADDRESS_KEYS),
        director: findString(data, DIRECTOR_KEYS),
        status: null,
        taxpayerType: null,
        lzchpType: null,
        vatPayer: null,
        vatStatus: null,
      }
      if (info.name || info.address) {
        const [enriched, nds] = await Promise.all([enrichWithEgov(info, taxId), ndsPromise])
        return { ok: true, info: { ...enriched, vatPayer: nds?.vatPayer ?? null, vatStatus: nds?.vatStatus ?? null } }
      }

      console.warn("[kgd] ответ получен, но поля не распознаны:", JSON.stringify(data).slice(0, 500))
      lastError = "Ответ справочника не распознан — пришлите пример ответа, поправим маппинг"
    } catch (e) {
      lastError = e instanceof Error && e.name === "TimeoutError"
        ? "Справочник не ответил за 8 секунд"
        : `Не удалось запросить справочник: ${e instanceof Error ? e.message : "сетевая ошибка"}`
    }
  }

  // КГД не нашёл/недоступен — последний шанс: ГБД ЮЛ по БИН
  if (kind === "UL") {
    const egov = await lookupEgovUl(taxId)
    if (egov && (egov.name || egov.address)) {
      const nds = await ndsPromise
      return { ok: true, info: { ...egov, status: null, taxpayerType: "UL", lzchpType: null, vatPayer: nds?.vatPayer ?? null, vatStatus: nds?.vatStatus ?? null } }
    }
  }
  return { ok: false, error: lastError }
}
