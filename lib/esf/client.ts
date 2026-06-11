import "server-only"

/**
 * SOAP-клиент к ИС ЭСФ КГД РК (минимальный, без зависимостей).
 * Сервисы: SessionService (esf) и AwpWebService (v1.awp) — WSDL в docs/esf-sdk.
 *
 * ENV:
 *   ESF_API_BASE — базовый URL. Прод: https://esf.gov.kz:8443
 *                  Тест: https://test3.esf.kgd.gov.kz:8443
 */

const ESF_API_BASE = (process.env.ESF_API_BASE || "https://esf.gov.kz:8443").replace(/\/$/, "")
const SESSION_URL = `${ESF_API_BASE}/esf-web/ws/api1/SessionService`
const AWP_URL = `${ESF_API_BASE}/esf-web/ws/api1/AwpWebService`

export class EsfError extends Error {
  constructor(message: string, public faultCode?: string) {
    super(message)
    this.name = "EsfError"
  }
}

function escXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

/** Извлечь содержимое первого тега (без учёта namespace-префиксов) */
function pick(xml: string, tagName: string): string | null {
  const m = new RegExp(`<(?:[\\w.]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.]+:)?${tagName}>`).exec(xml)
  return m ? m[1].trim() : null
}

function pickAll(xml: string, tagName: string): string[] {
  const re = new RegExp(`<(?:[\\w.]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.]+:)?${tagName}>`, "g")
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim())
  return out
}

/** WS-Security UsernameToken заголовок (нужен для createSession). */
function wsseHeader(username: string, password: string): string {
  const WSSE = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"
  const WSU = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd"
  const PWTYPE = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText"
  return `<soapenv:Header>`
    + `<wsse:Security soapenv:mustUnderstand="1" xmlns:wsse="${WSSE}" xmlns:wsu="${WSU}">`
    + `<wsse:UsernameToken wsu:Id="UsernameToken-1">`
    + `<wsse:Username>${escXml(username)}</wsse:Username>`
    + `<wsse:Password Type="${PWTYPE}">${escXml(password)}</wsse:Password>`
    + `</wsse:UsernameToken></wsse:Security></soapenv:Header>`
}

async function soapCall(url: string, bodyXml: string, timeoutMs = 30_000, headerXml = "<soapenv:Header/>"): Promise<string> {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>`
    + `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">`
    + `${headerXml}<soapenv:Body>${bodyXml}</soapenv:Body></soapenv:Envelope>`

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: envelope,
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  })
  const text = await res.text()

  // SOAP Fault → понятная ошибка (faultstring обычно по-русски от ИС ЭСФ)
  const fault = pick(text, "faultstring") || pick(text, "message")
  if (!res.ok || /<(?:[\w.]+:)?Fault[\s>]/.test(text)) {
    throw new EsfError(fault || `ИС ЭСФ ответила ${res.status}`, pick(text, "faultcode") ?? undefined)
  }
  return text
}

/**
 * Открыть сессию. Обязателен WS-Security UsernameToken в заголовке
 * (Username = БИН/ИИН, Password = пароль ЭЦП-контейнера) — без него ИС ЭСФ
 * отвечает «A security error was encountered when verifying the message».
 * В теле — tin + сертификат подписанта (base64).
 */
export async function createSession(tin: string, x509CertificatePem: string, password: string): Promise<string> {
  const cert = x509CertificatePem.replace(/-----(BEGIN|END) CERTIFICATE-----|\s/g, "")
  const body = `<ns:createSessionRequest xmlns:ns="esf">`
    + `<tin>${escXml(tin)}</tin>`
    + `<x509Certificate>${escXml(cert)}</x509Certificate>`
    + `</ns:createSessionRequest>`
  const xml = await soapCall(SESSION_URL, body, 30_000, wsseHeader(tin, password))
  const sessionId = pick(xml, "sessionId")
  if (!sessionId) throw new EsfError("ИС ЭСФ не вернула sessionId")
  return sessionId
}

export async function closeSession(sessionId: string): Promise<void> {
  const body = `<ns:closeSessionRequest xmlns:ns="esf"><sessionId>${escXml(sessionId)}</sessionId></ns:closeSessionRequest>`
  await soapCall(SESSION_URL, body).catch(() => { /* закрытие — best effort */ })
}

export type EsfSignatureType = "COMPANY" | "OPERATOR" | "EMPLOYEE"

export interface UploadAwpResult {
  /** Внутренний id АВР в ИС ЭСФ */
  id: string | null
  /** Регистрационный номер (АКТ-…) — может появиться позже, после обработки */
  registrationNumber: string | null
  raw: string
}

/**
 * Загрузка подписанного АВР.
 * signature — base64 ЭЦП XML-представления АВР (raw ГОСТ-подпись, ≤400 символов).
 */
export async function uploadAwp(params: {
  sessionId: string
  awpXml: string
  signature: string
  signatureType?: EsfSignatureType
  x509CertificatePem: string
}): Promise<UploadAwpResult> {
  const cert = params.x509CertificatePem.replace(/-----(BEGIN|END) CERTIFICATE-----|\s/g, "")
  const body = `<ns:awpUploadRequest xmlns:ns="v1.awp">`
    + `<sessionId>${escXml(params.sessionId)}</sessionId>`
    + `<awpInfoList><awpInfo>`
    + `<awpBody>${escXml(params.awpXml)}</awpBody>`
    + `<signature>${escXml(params.signature)}</signature>`
    + `<signatureType>${params.signatureType ?? "COMPANY"}</signatureType>`
    + `</awpInfo></awpInfoList>`
    + `<x509Certificate>${escXml(cert)}</x509Certificate>`
    + `</ns:awpUploadRequest>`
  const xml = await soapCall(AWP_URL, body, 60_000)

  // В ответе resultList/awpInfoList: id + registrationNumber (имена без префиксов)
  const declined = pickAll(xml, "declined")
  if (declined.length > 0) {
    const reason = pick(declined[0], "cause") || pick(declined[0], "description") || declined[0].slice(0, 300)
    throw new EsfError(`ИС ЭСФ отклонила АВР: ${reason}`)
  }
  return {
    id: pick(xml, "id"),
    registrationNumber: pick(xml, "registrationNumber"),
    raw: xml,
  }
}

export interface AwpStatusResult {
  status: string | null
  registrationNumber: string | null
  raw: string
}

export async function queryAwpStatusById(sessionId: string, awpId: string): Promise<AwpStatusResult> {
  const body = `<ns:awpQueryStatusByIdRequest xmlns:ns="v1.awp">`
    + `<sessionId>${escXml(sessionId)}</sessionId>`
    + `<id>${escXml(awpId)}</id>`
    + `</ns:awpQueryStatusByIdRequest>`
  const xml = await soapCall(AWP_URL, body)
  return {
    status: pick(xml, "status"),
    registrationNumber: pick(xml, "registrationNumber"),
    raw: xml,
  }
}
