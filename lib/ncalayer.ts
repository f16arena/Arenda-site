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
  status: boolean
  result?: string | { signature?: string; certificates?: string[] }
  errorCode?: string
  message?: string
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

/**
 * Подписать строку (base64) через NCALayer.
 * Возвращает signed CMS (PKCS#7) с цепочкой сертификатов в base64.
 *
 * @param dataB64 Данные для подписи в base64 (можно подписать сам документ, либо его SHA-256 хеш)
 * @param signMode "signRaw" подписывает byte-stream напрямую; "signXml" — XML с XMLDSig (для ЭСФ)
 */
export async function signWithNCALayer(
  dataB64: string,
  signMode: "raw" | "cms" = "cms",
): Promise<NcaSignResponse> {
  if (typeof window === "undefined") {
    return { ok: false, error: "NCALayer работает только в браузере" }
  }

  let ws: WebSocket
  try {
    ws = await connect()
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось подключиться к NCALayer" }
  }

  const request = signMode === "cms"
    ? {
        module: "kz.gov.pki.knca.commonUtils",
        method: "createCMSSignatureFromBase64",
        args: [
          "PKCS12",         // Storage type — PKCS12 (.p12 файл) или AKKaztoken / EToken
          "SIGNATURE",      // Назначение — подпись (не аутентификация)
          dataB64,
          true,             // attached signature (документ внутри подписи)
        ],
      }
    : {
        module: "kz.gov.pki.knca.commonUtils",
        method: "signXml",
        args: ["PKCS12", "SIGNATURE", dataB64, "", ""],
      }

  return new Promise<NcaSignResponse>((resolve) => {
    const timeout = setTimeout(() => {
      try { ws.close() } catch { /* noop */ }
      resolve({ ok: false, error: "Превышено время ожидания. Введите PIN в окне NCALayer и попробуйте снова." })
    }, TIMEOUT_MS)

    ws.onmessage = (event) => {
      clearTimeout(timeout)
      try {
        const msg = JSON.parse(event.data) as NcaWsMessage
        try { ws.close() } catch { /* noop */ }

        if (!msg.status) {
          const code = msg.errorCode ?? "unknown"
          const human =
            code === "USER_CANCELLED" ? "Подписание отменено" :
            code === "EMPTY_KEY_STORE" ? "Файл сертификата не найден" :
            code === "WRONG_PASSWORD" ? "Неверный PIN" :
            msg.message ?? "Ошибка NCALayer"
          resolve({ ok: false, error: human, code })
          return
        }

        const result = msg.result
        if (typeof result === "string") {
          // Старый протокол — result это base64 signature
          resolve({
            ok: true,
            signature: result,
            signerCert: "",
            signerInfo: {},
          })
          return
        }
        if (result && typeof result === "object" && "signature" in result) {
          resolve({
            ok: true,
            signature: result.signature ?? "",
            signerCert: (result.certificates ?? []).join("\n"),
            signerInfo: {},
          })
          return
        }
        resolve({ ok: false, error: "Неожиданный формат ответа NCALayer" })
      } catch (e) {
        resolve({ ok: false, error: e instanceof Error ? e.message : "JSON parse error" })
      }
    }

    ws.onerror = () => {
      clearTimeout(timeout)
      resolve({ ok: false, error: "Ошибка соединения с NCALayer" })
    }

    ws.send(JSON.stringify(request))
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
