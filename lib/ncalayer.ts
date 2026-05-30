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

// Коды, при которых повторять подпись бессмысленно (пользователь сам прервал/ошибся).
const NON_RETRYABLE_CODES = new Set(["USER_CANCELLED", "WRONG_PASSWORD", "EMPTY_KEY_STORE"])

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

// Все известные хранилища ключей (для basics-модуля): файл .p12 + аппаратные токены.
const ALL_STORAGES = ["PKCS12", "AKKaztoken", "AKKONAITOKEN", "ETOKEN72K", "JaCarta", "AKEUSB"]

/** Один RPC-вызов к NCALayer: открыть ws, отправить запрос, дождаться ответа. */
function runSign(request: unknown): Promise<NcaSignResponse> {
  return new Promise<NcaSignResponse>((resolve) => {
    connect().then((ws) => {
      const timeout = setTimeout(() => {
        try { ws.close() } catch { /* noop */ }
        resolve({ ok: false, error: "Превышено время ожидания. Введите PIN в окне NCALayer и попробуйте снова." })
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
              code === "EMPTY_KEY_STORE" ? "Файл сертификата (ключ) не найден" :
              code === "WRONG_PASSWORD" ? "Неверный пароль/PIN к ключу" :
              msg.message ?? "Ошибка NCALayer"
            resolve({ ok: false, error: human, code })
            return
          }

          // Полный CMS (сертификат подписанта внутри) — сервер распарсит его сам.
          const signature = extractSignature(msg)
          if (signature) {
            resolve({ ok: true, signature, signerCert: signature, signerInfo: {} })
            return
          }
          resolve({ ok: false, error: "Неожиданный формат ответа NCALayer (нет подписи)", code: "NO_SIGNATURE" })
        } catch (e) {
          resolve({ ok: false, error: e instanceof Error ? e.message : "JSON parse error", code: "PARSE_ERROR" })
        }
      }

      ws.onerror = () => {
        clearTimeout(timeout)
        resolve({ ok: false, error: "Ошибка соединения с NCALayer" })
      }

      ws.send(JSON.stringify(request))
    }).catch((e) => {
      resolve({ ok: false, error: e instanceof Error ? e.message : "Не удалось подключиться к NCALayer" })
    })
  })
}

/**
 * Подписать строку (base64) через NCALayer.
 * Возвращает signed CMS (PKCS#7) с цепочкой сертификатов в base64.
 *
 * @param dataB64 Данные для подписи в base64 (можно подписать сам документ, либо его SHA-256 хеш)
 * @param signMode "cms" подписывает byte-stream → CMS; "raw" — XML с XMLDSig (для ЭСФ)
 * @param opts.tsp Запросить встроенную метку доверенного времени (TSP, НУЦ РК). Использует
 *        модуль kz.gov.pki.knca.basics с tsaProfile; при неуспехе автоматически откатывается
 *        на проверенный commonUtils без TSP, чтобы подпись никогда не падала из-за TSP.
 */
export async function signWithNCALayer(
  dataB64: string,
  signMode: "raw" | "cms" = "cms",
  opts?: { tsp?: boolean },
): Promise<NcaSignResponse> {
  if (typeof window === "undefined") {
    return { ok: false, error: "NCALayer работает только в браузере" }
  }

  // XML-подпись (ЭСФ) — без TSP, прежний путь.
  if (signMode === "raw") {
    return runSign({
      module: "kz.gov.pki.knca.commonUtils",
      method: "signXml",
      args: ["PKCS12", "SIGNATURE", dataB64, "", ""],
    })
  }

  // CMS со встроенным TSP-токеном через basics-модуль (CAdES-T).
  if (opts?.tsp) {
    const tsp = await runSign({
      module: "kz.gov.pki.knca.basics",
      method: "sign",
      args: {
        allowedStorages: ALL_STORAGES,
        format: "cms",
        data: dataB64,
        signingParams: { decode: false, encapsulate: true, digested: false, tsaProfile: {} },
        signerParams: { extKeyUsageOids: ["1.3.6.1.5.5.7.3.4"] }, // OID назначения «подпись»
        locale: "ru",
      },
    })
    // Пользователь сам прервал/ошибся ключом — не откатываемся, показываем как есть.
    if (tsp.ok || (tsp.code && NON_RETRYABLE_CODES.has(tsp.code))) return tsp
    // Старый NCALayer без basics/TSA — тихо откатываемся на обычный CMS.
  }

  // Обычная CMS-подпись (attached), без TSP.
  return runSign({
    module: "kz.gov.pki.knca.commonUtils",
    method: "createCMSSignatureFromBase64",
    args: [
      "PKCS12",         // Storage type — PKCS12 (.p12 файл) или AKKaztoken / EToken
      "SIGNATURE",      // Назначение — подпись (не аутентификация)
      dataB64,
      true,             // attached signature (документ внутри подписи)
    ],
  })
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
