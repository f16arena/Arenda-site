// Клиент для NCALayer — государственного посредника НУЦ РК для работы с ЭЦП.
// Документация: https://ncalayer.kz/
//
// NCALayer — это desktop-приложение которое нужно установить локально (Java).
// Оно открывает WebSocket на ws://127.0.0.1:13579 (или wss://127.0.0.1:13579 в свежих версиях).
// Web-приложение подключается через WebSocket, отправляет документ для подписи,
// получает обратно signed CMS (PKCS#7) с цепочкой сертификатов.
//
// Используется на стороне CLIENT (браузер), потому что приватный ключ
// никогда не покидает компьютер пользователя.

const NCA_HOSTS = [
  "wss://127.0.0.1:13579",
  "ws://127.0.0.1:13579",
] as const

const TIMEOUT_MS = 60_000  // 60 секунд на ввод PIN

export interface NcaSignResult {
  ok: true
  signature: string       // base64 CMS SignedData
  signerCert: string      // base64 X.509 цепочка
  signerInfo: {
    commonName?: string
    iin?: string
    bin?: string
    organization?: string
    validFrom?: string
    validTo?: string
  }
}

export interface NcaSignError {
  ok: false
  error: string
  code?: string
}

export type NcaSignResponse = NcaSignResult | NcaSignError

interface NcaWsMessage {
  // Разные версии NCALayer отвечают по-разному:
  //  - commonUtils: { code: "200"|"500", responseObject?: ..., result?: ..., message? }
  //  - новые модули: { status: boolean, result?: ..., errorCode?, message? }
  //  - basics (sign): { status: true, body: { result: [<base64Cms>] } }
  status?: boolean
  code?: string
  result?: string | string[] | { signature?: string; certificates?: string[] }
  responseObject?: string | { signature?: string; certificates?: string[] }
  body?: { result?: string | string[] }
  errorCode?: string
  message?: string
}

/** Достаёт base64-CMS из ответа NCALayer любого из известных форматов. */
function extractSignature(msg: NcaWsMessage): string | null {
  // basics-модуль (TSP): подпись лежит в body.result (строка или массив).
  for (const candidate of [msg.body?.result, msg.result, msg.responseObject]) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate
    if (Array.isArray(candidate)) {
      const first = candidate.find((x) => typeof x === "string" && x.length > 0)
      if (first) return first
    }
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate) && candidate.signature) {
      return candidate.signature
    }
  }
  return null
}

/**
 * Открыть WebSocket к NCALayer. Пробует wss:// потом ws://.
 */
function connect(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let attempted = 0
    const tryConnect = (idx: number) => {
      if (idx >= NCA_HOSTS.length) {
        reject(new Error("Не удалось подключиться к NCALayer. Установите его и запустите."))
        return
      }
      const ws = new WebSocket(NCA_HOSTS[idx])
      ws.onopen = () => resolve(ws)
      ws.onerror = () => {
        attempted++
        if (attempted >= NCA_HOSTS.length) {
          reject(new Error("NCALayer не запущен. Скачайте его на pki.gov.kz, запустите и попробуйте снова."))
        } else {
          tryConnect(idx + 1)
        }
      }
    }
    tryConnect(0)
  })
}

const COMMON = "kz.gov.pki.knca.commonUtils"

/**
 * NCALayer при коннекте (и периодически) шлёт служебный heartbeat вида
 * {"result":{"version":"1.4"}} — это НЕ ответ на запрос. Его нужно пропускать,
 * иначе он принимается за результат подписи (был баг «ответ без подписи»).
 */
function isHeartbeat(msg: NcaWsMessage): boolean {
  const r = msg?.result
  return (
    !!r && typeof r === "object" && !Array.isArray(r) &&
    "version" in (r as Record<string, unknown>) &&
    msg.responseObject === undefined && msg.code === undefined &&
    msg.status === undefined && msg.errorCode === undefined && msg.body === undefined
  )
}

/**
 * Низкоуровневый вызов NCALayer. Возвращает СЫРОЙ разобранный ответ для любого
 * полученного JSON (успех определяет вызывающий — по наличию подписи, а не по коду,
 * т.к. формат поля code/status разнится между версиями NCALayer). ok:false — только
 * транспортные сбои (нет соединения / таймаут / не-JSON).
 */
function rawRpc(request: unknown, timeoutMs: number = TIMEOUT_MS): Promise<{ ok: true; msg: NcaWsMessage } | { ok: false; error: string; code: string }> {
  return new Promise((resolve) => {
    connect().then((ws) => {
      const timeout = setTimeout(() => {
        try { ws.close() } catch { /* noop */ }
        resolve({ ok: false, error: "Превышено время ожидания. Введите PIN в окне NCALayer и попробуйте снова.", code: "TIMEOUT" })
      }, timeoutMs)

      ws.onmessage = (event) => {
        let msg: NcaWsMessage
        try {
          msg = JSON.parse(event.data) as NcaWsMessage
        } catch {
          clearTimeout(timeout)
          try { ws.close() } catch { /* noop */ }
          resolve({ ok: false, error: "NCALayer вернул не-JSON ответ", code: "PARSE_ERROR" })
          return
        }
        // NCALayer при подключении/периодически шлёт heartbeat {"result":{"version":"x.x"}}.
        // Это НЕ ответ на наш запрос — игнорируем и продолжаем ждать настоящий ответ.
        if (isHeartbeat(msg)) return
        clearTimeout(timeout)
        try { ws.close() } catch { /* noop */ }
        resolve({ ok: true, msg })
      }

      ws.onerror = () => {
        clearTimeout(timeout)
        resolve({ ok: false, error: "Ошибка соединения с NCALayer", code: "WS_ERROR" })
      }

      ws.send(JSON.stringify(request))
    }).catch((e) => {
      resolve({ ok: false, error: e instanceof Error ? e.message : "Не удалось подключиться к NCALayer", code: "NO_CONNECT" })
    })
  })
}

/** Человекочитаемая ошибка из ответа NCALayer (когда подписи в ответе нет). */
function errorFromMsg(msg: NcaWsMessage): { error: string; code: string } {
  const code = String(msg.errorCode ?? msg.code ?? "unknown")
  const known =
    code === "USER_CANCELLED" ? "Подписание отменено пользователем" :
    code === "EMPTY_KEY_STORE" ? "Ключ не найден: выберите файл ЭЦП (.p12 / RSA…) или вставьте токен" :
    code === "WRONG_PASSWORD" ? "Неверный пароль/PIN к ключу" :
    code === "NO_TOKENS_FOUND" ? "Не найдено ни одного ключа/токена в NCALayer" :
    null
  if (known) return { error: known, code }
  if (msg.message) return { error: `NCALayer: ${msg.message}`, code }
  // Совсем неизвестный формат — покажем сырой ответ (обрезанный) для диагностики.
  let raw = ""
  try { raw = JSON.stringify(msg).slice(0, 200) } catch { /* noop */ }
  return { error: `NCALayer вернул ответ без подписи. Ответ: ${raw || "(пусто)"}`, code }
}

/** Вызов, ожидающий подпись (CMS). Успех = подпись извлечена из ответа (любой формат). */
async function signCall(request: unknown): Promise<NcaSignResponse> {
  const r = await rawRpc(request)
  if (!r.ok) return { ok: false, error: r.error, code: r.code }
  // Если в ответе есть строка подписи — значит успех, независимо от поля code.
  const signature = extractSignature(r.msg)
  if (signature && signature.length > 100) {
    return { ok: true, signature, signerCert: signature, signerInfo: {} }
  }
  const { error, code } = errorFromMsg(r.msg)
  return { ok: false, error, code }
}

/** Тип хранилища ключа, выбранный пользователем (или авто-определение). */
export type KeyStoragePref = "auto" | "file" | "token"

/**
 * Определяет хранилище ключа по предпочтению пользователя:
 *   - "file"  → всегда PKCS12 (файл .p12), даже если воткнут токен;
 *   - "token" → подключённый аппаратный токен (Kaztoken/eToken/JaCarta…);
 *   - "auto"  → токен если есть, иначе файл (прежнее поведение).
 * Раньше было жёстко "PKCS12" (у кого токен — «ключ не найден»), потом жёстко
 * токен (у кого файл и воткнут токен — нельзя выбрать файл). Теперь — по выбору.
 */
async function detectStorage(pref: KeyStoragePref = "auto"): Promise<string> {
  if (pref === "file") return "PKCS12" // файл .p12 — NCALayer покажет выбор файла
  if (pref === "auto" || pref === "token") {
    const r = await rawRpc({ module: COMMON, method: "getActiveTokens" })
    if (r.ok) {
      const ro: unknown = (r.msg.responseObject as unknown) ?? (r.msg.result as unknown)
      const list: string[] = Array.isArray(ro)
        ? ro.filter((x): x is string => typeof x === "string")
        : (typeof ro === "string" && ro ? [ro] : [])
      const token = list.find((s) => s && s !== "PKCS12")
      if (token) return token
    }
    // Токен запрошен явно, но не найден — подсказываем вставить его.
    if (pref === "token") throw new Error("Токен не найден. Вставьте Kaztoken/eToken в USB и попробуйте снова — либо выберите «Файл (.p12)».")
  }
  return "PKCS12" // авто-режим без токена → файл
}

/**
 * Подписать строку (base64) через NCALayer по официальному потоку SDK 2.0
 * (kz.gov.pki.knca.commonUtils):
 *   1) определяем хранилище ключа (getActiveTokens → токен или PKCS12);
 *   2) createCMSSignatureFromBase64 — attached CMS-подпись;
 *   3) при opts.tsp — applyCAdEST приклеивает метку доверенного времени (CAdES-T).
 * Если applyCAdEST недоступен (нет TSA / старый NCALayer) — возвращаем валидную
 * подпись без метки, не роняя подписание.
 *
 * @param dataB64 Данные для подписи в base64
 * @param signMode "cms" → CMS; "raw" → signXml (XMLDSig, для ЭСФ)
 * @param opts.tsp Приложить метку доверенного времени (TSP, НУЦ РК)
 */
export async function signWithNCALayer(
  dataB64: string,
  signMode: "raw" | "cms" = "cms",
  opts?: { tsp?: boolean; storage?: KeyStoragePref },
): Promise<NcaSignResponse> {
  if (typeof window === "undefined") {
    return { ok: false, error: "NCALayer работает только в браузере" }
  }

  let storage: string
  try {
    storage = await detectStorage(opts?.storage ?? "auto")
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось определить ключ", code: "NO_STORAGE" }
  }

  // XML-подпись (ЭСФ) — без TSP.
  if (signMode === "raw") {
    return signCall({ module: COMMON, method: "signXml", args: [storage, "SIGNATURE", dataB64, "", ""] })
  }

  // CMS-подпись (attached): данные включены в подпись (флаг = true).
  // ВАЖНО: метку доверенного времени (TSP) НЕ прикладываем отдельным шагом
  // applyCAdEST — на ключе-файле .p12 это вызывает повторный запрос пароля
  // (второе открытие хранилища). Подпись валидна и без TSP (сертификат + OCSP).
  // opts.tsp оставлен для совместимости, но второй вызов больше не делаем.
  void opts
  return signCall({
    module: COMMON,
    method: "createCMSSignatureFromBase64",
    args: [storage, "SIGNATURE", dataB64, true],
  })
}

/**
 * Нормализует CMS-подпись из модуля basics в ОБЫЧНЫЙ base64 (как у commonUtils).
 * basics часто отдаёт подпись в PEM-обёртке («-----BEGIN CMS-----» … «-----END CMS-----»):
 *  - символ «-» (0x2d) ломал декодер → «Illegal base64 character 2d»,
 *  - после наивной замены -→+ заголовки превращались в мусор → «Too big integer».
 * Поэтому: срезаем PEM-армор, убираем пробелы/переводы строк, на всякий случай
 * конвертируем оставшиеся base64url-символы, добавляем паддинг. Голый base64 не меняется.
 */
function toStdBase64(s: string): string {
  let out = s.replace(/-----[A-Z0-9 ]+-----/g, "").replace(/\s+/g, "")
  if (/[-_]/.test(out)) out = out.replace(/-/g, "+").replace(/_/g, "/")
  while (out.length % 4 !== 0) out += "="
  return out
}

/** Достаёт МАССИВ base64-CMS из ответа NCALayer (модуль basics, multisign). */
function extractSignatureArray(msg: NcaWsMessage): string[] | null {
  for (const candidate of [msg.body?.result, msg.result, msg.responseObject]) {
    if (Array.isArray(candidate)) {
      const arr = candidate.filter((x): x is string => typeof x === "string" && x.length > 100)
      if (arr.length > 0) return arr
    }
    if (typeof candidate === "string" && candidate.length > 100) return [candidate]
  }
  return null
}

/**
 * Групповое подписание: модуль `kz.gov.pki.knca.basics`, метод `sign` принимает
 * МАССИВ данных (data: string[]) и подписывает их за ОДИН выбор ключа / ввод пароля
 * (в отличие от commonUtils.createCMSSignatureFromBase64, который спрашивает пароль
 * на каждый документ). Возвращает массив CMS-подписей в том же порядке.
 *
 * Доступно не во всех версиях NCALayer — если метод не поддержан, возвращаем ok:false
 * (вызывающий откатывается на поштучное подписание).
 *
 * @param dataB64List Документы для подписи (base64), по одному на элемент.
 * @param opts.storage Предпочтение хранилища ключа (file → только PKCS12).
 */
export async function signManyWithNCALayer(
  dataB64List: string[],
  opts?: { storage?: KeyStoragePref },
): Promise<{ ok: true; signatures: string[] } | NcaSignError> {
  if (typeof window === "undefined") {
    return { ok: false, error: "NCALayer работает только в браузере" }
  }
  if (dataB64List.length === 0) return { ok: true, signatures: [] }

  // file → ограничиваем хранилище файлом .p12; token/auto → null (NCALayer даст выбрать).
  const allowedStorages = opts?.storage === "file" ? ["PKCS12"] : null

  // Тайм-аут больше обычного: один ввод пароля, но подписей много.
  const timeoutMs = Math.min(10 * 60_000, 60_000 + dataB64List.length * 20_000)

  const r = await rawRpc({
    module: "kz.gov.pki.knca.basics",
    method: "sign",
    args: {
      allowedStorages,
      format: "cms",
      // decode:true → NCALayer декодирует base64 и подписывает БАЙТЫ файла (как
      //   commonUtils.createCMSSignatureFromBase64), иначе подпись была бы над
      //   base64-текстом и сервер бы её отклонил.
      // encapsulate:true → attached CMS (данные внутри подписи).
      data: dataB64List,
      signingParams: { decode: true, encapsulate: true, digested: false, tsaProfile: null },
      // extKeyUsageOids:[] — пустой массив, не null (на null NCALayer бросает INVOCATION_ERROR).
      signerParams: { extKeyUsageOids: [] },
      locale: "ru",
    },
  }, timeoutMs)

  if (!r.ok) return { ok: false, error: r.error, code: r.code }

  const signatures = extractSignatureArray(r.msg)
  if (signatures && signatures.length === dataB64List.length) {
    return { ok: true, signatures: signatures.map(toStdBase64) }
  }
  // Метод не поддержан / неожиданный формат → пусть вызывающий откатится на поштучно.
  const { error, code } = errorFromMsg(r.msg)
  return { ok: false, error, code: code === "unknown" ? "MULTISIGN_UNSUPPORTED" : code }
}

/**
 * Хеширует строку SHA-256 и возвращает base64.
 * Используется для подписи "хеша документа", а не самого документа
 * (если документ большой).
 */
export async function sha256Base64(input: string | ArrayBuffer): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("sha256Base64 работает только в браузере")
  }
  const buf = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input)
  const hashBuffer = await crypto.subtle.digest("SHA-256", buf)
  const bytes = new Uint8Array(hashBuffer)
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

/**
 * Скачать файл по URL и вернуть его в base64 (для подписи документа целиком).
 */
export async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) throw new Error(`Не удалось скачать документ: ${res.status}`)
  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
