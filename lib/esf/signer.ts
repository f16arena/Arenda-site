import "server-only"

/**
 * Подпись АВР/документов для ИС ЭСФ КГД РК.
 *
 * Формат подписи — проприетарный (TrustyUtils.sign поверх Kalkan), его делает
 * ЭТАЛОННОЕ приложение из SDK КГД: esf_local_server.jar (метод SOAP
 * generateDocumentSignature). Воспроизводить его на Node нельзя — поэтому
 * разворачиваем этот jar как сервис подписи на нашем VPS (рядом с NCANode,
 * порт 6666) и зовём по SOAP.
 *
 * Развёртывание (НЕ трогая NCANode):
 *   1) на VPS: java -jar esf_local_server.jar  (слушает http://0.0.0.0:6666/LocalService)
 *   2) рядом положить GOSTKNCA-ключ организации (.p12)
 *   3) env приложения:
 *        ESF_SIGN_URL       — http://<vps>:6666/LocalService (внутренний, не наружу)
 *        ESF_SIGN_CERT_PATH — путь к .p12 на VPS (видит jar)
 *        ESF_SIGN_CERT_PIN  — пароль контейнера
 *        ESF_SIGN_NS        — (опц.) namespace WSDL сервиса, по умолчанию "esf"
 *
 * Ответ метода: { signedData, signature, certificate(base64) } — signature идёт
 * в uploadAwp, certificate — в createSession/uploadAwp как x509Certificate.
 */

const ESF_SIGN_URL = (process.env.ESF_SIGN_URL || "").replace(/\/$/, "")
// Дефолтный ключ (bootstrap-орг). Для мультиорг путь/PIN приходят параметром
// из OrgEsfConfig (lib/esf/config.ts).
const DEFAULT_CERT_PATH = process.env.ESF_SIGN_CERT_PATH || ""
const DEFAULT_CERT_PIN = process.env.ESF_SIGN_CERT_PIN || ""
const ESF_SIGN_NS = process.env.ESF_SIGN_NS || "esf"
// Секрет Caddy-маршрута на VPS (тот же приём, что X-Ncanode-Secret):
// сервис подписи проксируется через https://ecp.commrent.kz/LocalService.
const ESF_SIGN_SECRET = process.env.ESF_SIGN_SECRET || ""

export interface EsfCertOpts {
  certPath?: string
  certPin?: string
  /** Загруженный .p12 в base64 — приоритетнее certPath (VPS принимает байты). */
  certData?: string
}

// Элемент ключа для VPS-подписанта: байты (самообслуживание) или путь (bootstrap).
function certElement(opts: EsfCertOpts): string {
  const certData = opts.certData || ""
  if (certData) return `<certificateBase64>${escXml(certData)}</certificateBase64>`
  return `<certificatePath>${escXml(opts.certPath || DEFAULT_CERT_PATH)}</certificatePath>`
}

// Сервис подписи настроен, если задан его URL. Сам ключ (.p12) теперь
// передаётся per-org (путь + PIN), а не глобально.
export function esfSignerConfigured(): boolean {
  return !!ESF_SIGN_URL
}

export interface EsfSignResult {
  /** base64 подпись XML-представления документа (поле signature в uploadAwp) */
  signature: string
  /** base64 сертификата подписанта (поле x509Certificate) */
  certificatePem: string
}

function escXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function pick(xml: string, tag: string): string | null {
  const m = new RegExp(`<(?:[\\w.]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.]+:)?${tag}>`).exec(xml)
  return m ? m[1].trim() : null
}

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

function ensureSignerConfigured() {
  if (!esfSignerConfigured()) {
    throw new Error(
      "Подпись для ИС ЭСФ ещё не подключена: разверните esf_local_server.jar на VPS и задайте ESF_SIGN_URL.",
    )
  }
}

// Общий вызов VPS-сервиса подписи (CXF BARE: один параметр-обёртка в namespace).
async function callSigner(innerXml: string): Promise<string> {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>`
    + `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:esf="${ESF_SIGN_NS}">`
    + `<soapenv:Body>${innerXml}</soapenv:Body></soapenv:Envelope>`
  try {
    const res = await fetch(ESF_SIGN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "",
        ...(ESF_SIGN_SECRET ? { "X-Esf-Sign-Secret": ESF_SIGN_SECRET } : {}),
      },
      body: envelope,
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    })
    const xml = await res.text()
    if (!res.ok) {
      const fault = pick(xml, "faultstring")
      throw new Error(fault || `Сервис подписи ответил ${res.status}`)
    }
    return xml
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Сервис подписи")) throw e
    throw new Error(`Сервис подписи ИС ЭСФ недоступен: ${e instanceof Error ? e.message : "ошибка сети"}`)
  }
}

/**
 * Сырая ГОСТ-подпись XML документа (АВР) через esf_local_server.jar
 * (documentSignatureRequest). certPath/certPin — per-org (иначе bootstrap env).
 */
export async function signAwpXml(awpXml: string, opts: EsfCertOpts = {}): Promise<EsfSignResult> {
  ensureSignerConfigured()
  const certPin = opts.certPin || DEFAULT_CERT_PIN

  const inner = `<esf:documentSignatureRequest>`
    + `<signableData>${escXml(awpXml)}</signableData>`
    + certElement(opts)
    + `<certificatePin>${escXml(certPin)}</certificatePin>`
    + `</esf:documentSignatureRequest>`
  const xml = await callSigner(inner)

  const signature = pick(xml, "signature")
  const certificate = pick(xml, "certificate")
  if (!signature) {
    const fault = pick(xml, "faultstring")
    throw new Error(fault ? `Сервис подписи: ${fault}` : "Сервис подписи вернул ответ без подписи")
  }
  return {
    signature,
    certificatePem: certificate || process.env.ESF_SIGN_CERT_PEM || "",
  }
}

/**
 * Подпись тикета аутентификации по стандарту xmlDsig (documentXmlSignatureRequest
 * → signedXmlData). Шаг 2 нового потока сессии. Возвращает подписанный XML
 * (тикет с <ds:Signature>), который идёт в createSessionSigned.
 */
export async function signTicketXml(ticketXml: string, opts: EsfCertOpts = {}): Promise<string> {
  ensureSignerConfigured()
  const certPin = opts.certPin || DEFAULT_CERT_PIN

  const inner = `<esf:documentXmlSignatureRequest>`
    + `<signableXmlData>${escXml(ticketXml)}</signableXmlData>`
    + certElement(opts)
    + `<certificatePin>${escXml(certPin)}</certificatePin>`
    + `</esf:documentXmlSignatureRequest>`
  const xml = await callSigner(inner)

  const signed = pick(xml, "signedXmlData")
  if (!signed) {
    const fault = pick(xml, "faultstring")
    throw new Error(fault ? `Сервис подписи (xmlDsig): ${fault}` : "Сервис подписи вернул пустой signedXmlData")
  }
  return unescapeXml(signed)
}
