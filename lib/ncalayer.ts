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

/** Низкоуровневый вызов NCALayer: открыть ws, отправить запрос, вернуть сырой ответ. */
function rpc(request: unknown): Promise<{ ok: true; msg: NcaWsMessage } | { ok: false; error: string; code?: string }> {
  return new Promise((resolve) => {
    connect().then((ws) => {
      const timeout = setTimeout(() => {
        try { ws.close() } catch { /* noop */ }
        resolve({ ok: false, error: "Превышено время ожидания. Введите PIN в окне NCALayer и попробуйте снова.", code: "TIMEOUT" })
      }, TIMEOUT_MS)

      ws.onmessage = (event) => {
        clearTimeout(timeout)
        try {
          const msg = JSON.parse(event.data) as NcaWsMessage
          try { ws.close() } catch { /* noop */ }

          // Успех: code === "200" ИЛИ status === true
          const isSuccess = msg.code === "200" || msg.status === true
          if (!isSuccess) {
            const code = msg.errorCode ?? msg.code ?? "unknown"
            const human =
              code === "USER_CANCELLED" ? "Подписание отменено пользователем" :
              code === "EMPTY_KEY_STORE" ? "Ключ не найден: выберите файл ЭЦП (.p12 / RSA…) или вставьте токен" :
              code === "WRONG_PASSWORD" ? "Неверный пароль/PIN к ключу" :
              code === "NO_TOKENS_FOUND" ? "Не найдено ни одного ключа/токена в NCALayer" :
              (msg.message ? `NCALayer: ${msg.message} (код ${code})` : `Ошибка NCALayer (код ${code})`)
            resolve({ ok: false, error: human, code })
            return
          }
          resolve({ ok: true, msg })
        } catch (e) {
          resolve({ ok: false, error: e instanceof Error ? e.message : "JSON parse error", code: "PARSE_ERROR" })
        }
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

/** Вызов, ожидающий подпись (CMS) в ответе. */
async function signCall(request: unknown): Promise<NcaSignResponse> {
  const r = await rpc(request)
  if (!r.ok) return { ok: false, error: r.error, code: r.code }
  const signature = extractSignature(r.msg)
  if (signature) return { ok: true, signature, signerCert: signature, signerInfo: {} }
  return { ok: false, error: "Неожиданный формат ответа NCALayer (нет подписи)", code: "NO_SIGNATURE" }
}

/**
 * Определяет хранилище ключа: подключённый аппаратный токен (Kaztoken/eToken/JaCarta…)
 * или PKCS12 (файл .p12). Раньше было жёстко "PKCS12" — у пользователя с токеном это
 * давало ошибку «ключ не найден». Теперь спрашиваем NCALayer (getActiveTokens).
 */
async function detectStorage(): Promise<string> {
  const r = await rpc({ module: COMMON, method: "getActiveTokens" })
  if (r.ok) {
    const ro: unknown = (r.msg.responseObject as unknown) ?? (r.msg.result as unknown)
    const list: string[] = Array.isArray(ro)
      ? ro.filter((x): x is string => typeof x === "string")
      : (typeof ro === "string" && ro ? [ro] : [])
    const token = list.find((s) => s && s !== "PKCS12")
    if (token) return token
  }
  return "PKCS12" // ключ-файл .p12 (NCALayer покажет выбор файла)
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
  opts?: { tsp?: boolean },
): Promise<NcaSignResponse> {
  if (typeof window === "undefined") {
    return { ok: false, error: "NCALayer работает только в браузере" }
  }

  const storage = await detectStorage()

  // XML-подпись (ЭСФ) — без TSP.
  if (signMode === "raw") {
    return signCall({ module: COMMON, method: "signXml", args: [storage, "SIGNATURE", dataB64, "", ""] })
  }

  // 1) Базовая CMS-подпись (attached): данные включены в подпись (флаг = true).
  const base = await signCall({
    module: COMMON,
    method: "createCMSSignatureFromBase64",
    args: [storage, "SIGNATURE", dataB64, true],
  })
  if (!base.ok || !opts?.tsp) return base

  // 2) Метка доверенного времени (TSP) — канонический applyCAdEST (CAdES-T).
  const stamped = await signCall({
    module: COMMON,
    method: "applyCAdEST",
    args: [storage, "SIGNATURE", base.signature],
  })
  // Если TSA недоступна/старый NCALayer — отдаём валидную подпись без метки.
  return stamped.ok ? stamped : base
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
