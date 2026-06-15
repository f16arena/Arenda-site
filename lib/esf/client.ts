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
const AUTH_URL = `${ESF_API_BASE}/esf-web/ws/api1/AuthService`

/** Обратное к escXml: тело authTicketXml приходит XML-escaped (это строка с XML). */
function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

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

  // SOAP Fault → понятная ошибка. faultstring у CXF бывает общим ("Fault
  // occurred while processing."), а настоящая причина — в <detail>. Достаём и то,
  // и другое; если всё пусто — отдаём кусок сырого ответа, чтобы было видно.
  if (!res.ok || /<(?:[\w.]+:)?Fault[\s>]/.test(text)) {
    const fault = pick(text, "faultstring") || pick(text, "message") || ""
    const detailRaw = pick(text, "detail")
    const detail = detailRaw
      ? detailRaw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400)
      : ""
    const message =
      [fault, detail && detail !== fault ? detail : ""].filter(Boolean).join(" | ")
      || text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400)
      || `ИС ЭСФ ответила ${res.status}`
    throw new EsfError(message, pick(text, "faultcode") ?? undefined)
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
 * Шаг 1 нового потока (ГОСТ-2015): получить тикет аутентификации.
 * AuthService.createAuthTicket(iin) → authTicketXml (XML для подписи xmlDsig).
 * iin — ИИН ФИЗЛИЦА-владельца ключа (для ИП = его ИИН). WSS UsernameToken —
 * логин/пароль учётки ИС ЭСФ.
 */
export async function createAuthTicket(iin: string): Promise<string> {
  // БЕЗ WS-Security: проверено вживую — с UsernameToken сервер возвращает пустой
  // authTicketXml; без заголовка отдаёт нормальный тикет. Аутентификация в новом
  // потоке — через подпись тикета (xmlDsig), а не логин/пароль учётки.
  const body = `<ns:createAuthTicketRequest xmlns:ns="esf"><iin>${escXml(iin)}</iin></ns:createAuthTicketRequest>`
  const xml = await soapCall(AUTH_URL, body, 30_000)
  const ticket = pick(xml, "authTicketXml")
  if (!ticket) {
    throw new EsfError("ИС ЭСФ вернула пустой authTicketXml — проверьте ИИН подписанта и права учётки ЭСФ")
  }
  return unescapeXml(ticket)
}

/**
 * Шаг 3 нового потока: открыть сессию по подписанному тикету.
 * SessionService.createSessionSigned(tin, signedAuthTicket) → sessionId.
 * tin — БИН организации; signedAuthTicket — тикет, подписанный xmlDsig (шаг 2).
 */
export async function createSessionSigned(
  tin: string,
  signedAuthTicket: string,
  username: string,
  password: string,
): Promise<string> {
  // ТРЕБУЕТ WS-Security UsernameToken (учётка ЭСФ): без него сервер отвечает
  // "A security error was encountered when verifying the message". В отличие от
  // createAuthTicket (там WSS, наоборот, ломает выдачу тикета).
  const body = `<ns:createSessionSignedRequest xmlns:ns="esf">`
    + `<tin>${escXml(tin)}</tin>`
    + `<signedAuthTicket>${escXml(signedAuthTicket)}</signedAuthTicket>`
    + `</ns:createSessionSignedRequest>`
  const xml = await soapCall(SESSION_URL, body, 30_000, wsseHeader(username, password))
  const sessionId = pick(xml, "sessionId")
  if (!sessionId) throw new EsfError("ИС ЭСФ не вернула sessionId (createSessionSigned)")
  return sessionId
}

export async function closeSession(sessionId: string, username: string, password: string): Promise<void> {
  const body = `<ns:closeSessionRequest xmlns:ns="esf"><sessionId>${escXml(sessionId)}</sessionId></ns:closeSessionRequest>`
  // WS-Security обязателен (как и для открытия) — иначе закрытие молча не срабатывает
  // и сессии «копятся» (User already has opened session).
  await soapCall(SESSION_URL, body, 30_000, wsseHeader(username, password)).catch(() => { /* best effort */ })
}

/**
 * Закрыть открытую сессию пользователя по реквизитам, не зная sessionId
 * (для очистки «зависшей» сессии перед открытием новой). Best-effort.
 */
export async function closeSessionByCredentials(tin: string, username: string, password: string): Promise<void> {
  const body = `<ns:closeSessionByCredentialsRequest xmlns:ns="esf"><tin>${escXml(tin)}</tin></ns:closeSessionByCredentialsRequest>`
  await soapCall(SESSION_URL, body, 30_000, wsseHeader(username, password)).catch(() => { /* best effort */ })
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
  /** ФИО/должность сдавшего (выписывающего) АВР — обязательно по схеме. */
  senderSignerName: string
}): Promise<UploadAwpResult> {
  const cert = params.x509CertificatePem.replace(/-----(BEGIN|END) CERTIFICATE-----|\s/g, "")
  // Порядок элементов в UploadAwpRequest строгий (xs:sequence):
  // sessionId → awpInfoList → x509Certificate → senderSignerName.
  const body = `<ns:awpUploadRequest xmlns:ns="v1.awp">`
    + `<sessionId>${escXml(params.sessionId)}</sessionId>`
    + `<awpInfoList><awpInfo>`
    + `<awpBody>${escXml(params.awpXml)}</awpBody>`
    // version обязателен по схеме AwpUploadInfo (enum awpVersion = "AwpV1").
    + `<version>AwpV1</version>`
    + `<signature>${escXml(params.signature)}</signature>`
    + `<signatureType>${params.signatureType ?? "COMPANY"}</signatureType>`
    + `</awpInfo></awpInfoList>`
    + `<x509Certificate>${escXml(cert)}</x509Certificate>`
    + `<senderSignerName>${escXml(params.senderSignerName)}</senderSignerName>`
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
