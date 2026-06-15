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
// Новый флоу под объединённый ГОСТ-2015 ключ: тикет берётся у отдельного AuthService.
const AUTH_URL = `${ESF_API_BASE}/esf-web/ws/api1/AuthService`

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

/**
 * НОВЫЙ ФЛОУ (ГОСТ-2015), шаг 1 — взять тикет авторизации (XML) у AuthService.
 * Старый createSession под объединённый ГОСТ-2015 ключ отвечает
 * METHOD_NOT_SUPPORT_GOST_2015; КГД ввёл схему «тикет → xmlDsig-подпись → сессия».
 *
 * Тикет (XML) далее подписывается enveloped XML-подписью (signTicketXmlDsig) и
 * передаётся в createSessionSigned как signedAuthTicket.
 *
 * WS-Security UsernameToken — учётка ИС ЭСФ (логин/пароль кабинета, НЕ пин ЭЦП).
 *
 * TODO(WSDL): сверить с актуальным AuthService.wsdl точные имена —
 *   запрос createAuthTicketRequest, поле tin, элемент ответа с телом тикета.
 */
export async function createAuthTicket(tin: string, username: string, password: string): Promise<string> {
  const ns = process.env.ESF_AUTH_NS || "esf"
  const body = `<ns:createAuthTicketRequest xmlns:ns="${ns}">`
    + `<tin>${escXml(tin)}</tin>`
    + `</ns:createAuthTicketRequest>`
  const xml = await soapCall(AUTH_URL, body, 30_000, wsseHeader(username, password))
  // Тело тикета: имя поля уточняется по WSDL — берём первое непустое из вероятных.
  const ticket = pick(xml, "authTicketXml") || pick(xml, "authTicket")
    || pick(xml, "ticketXml") || pick(xml, "ticket") || pick(xml, "authTicketRequest")
  if (!ticket) throw new EsfError("AuthService вернул пустой тикет — сверьте имя поля по AuthService.wsdl")
  return ticket
}

/**
 * НОВЫЙ ФЛОУ, шаг 3 — открыть сессию по подписанному тикету. Аналог createSession,
 * но вместо tin+x509Certificate принимает signedAuthTicket (тикет из шага 1,
 * подписанный xmlDsig: внутри X509Certificate + SignatureValue).
 *
 * TODO(WSDL): сверить createSessionSignedRequest / поле signedAuthTicket и нужен ли
 *   WS-Security заголовок (тикет уже несёт подпись — возможно, не нужен).
 */
export async function createSessionSigned(signedAuthTicket: string, wss?: { username: string; password: string }): Promise<string> {
  const body = `<ns:createSessionSignedRequest xmlns:ns="esf">`
    + `<signedAuthTicket>${escXml(signedAuthTicket)}</signedAuthTicket>`
    + `</ns:createSessionSignedRequest>`
  const header = wss ? wsseHeader(wss.username, wss.password) : "<soapenv:Header/>"
  const xml = await soapCall(SESSION_URL, body, 30_000, header)
  const sessionId = pick(xml, "sessionId")
  if (!sessionId) throw new EsfError("ИС ЭСФ не вернула sessionId на createSessionSignedRequest")
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
