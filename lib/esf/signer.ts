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
const ESF_SIGN_CERT_PATH = process.env.ESF_SIGN_CERT_PATH || ""
const ESF_SIGN_CERT_PIN = process.env.ESF_SIGN_CERT_PIN || ""
const ESF_SIGN_NS = process.env.ESF_SIGN_NS || "esf"

export function esfSignerConfigured(): boolean {
  return !!(ESF_SIGN_URL && ESF_SIGN_CERT_PATH && ESF_SIGN_CERT_PIN)
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

/**
 * Подписать XML документа (АВР) через сервис подписи КГД (esf_local_server.jar).
 * Бросает понятную ошибку, если сервис не настроен/недоступен.
 */
export async function signAwpXml(awpXml: string): Promise<EsfSignResult> {
  if (!esfSignerConfigured()) {
    throw new Error(
      "Подпись для ИС ЭСФ ещё не подключена: разверните esf_local_server.jar на VPS и задайте "
      + "ESF_SIGN_URL / ESF_SIGN_CERT_PATH / ESF_SIGN_CERT_PIN.",
    )
  }

  // CXF BARE: один параметр-обёртка documentSignatureRequest в namespace сервиса
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>`
    + `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:esf="${ESF_SIGN_NS}">`
    + `<soapenv:Body>`
    + `<esf:documentSignatureRequest>`
    + `<signableData>${escXml(awpXml)}</signableData>`
    + `<certificatePath>${escXml(ESF_SIGN_CERT_PATH)}</certificatePath>`
    + `<certificatePin>${escXml(ESF_SIGN_CERT_PIN)}</certificatePin>`
    + `</esf:documentSignatureRequest>`
    + `</soapenv:Body></soapenv:Envelope>`

  let xml: string
  try {
    const res = await fetch(ESF_SIGN_URL, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
      body: envelope,
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    })
    xml = await res.text()
    if (!res.ok) {
      const fault = pick(xml, "faultstring")
      throw new Error(fault || `Сервис подписи ответил ${res.status}`)
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Сервис подписи")) throw e
    throw new Error(`Сервис подписи ИС ЭСФ недоступен: ${e instanceof Error ? e.message : "ошибка сети"}`)
  }

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
