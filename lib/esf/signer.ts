import "server-only"

/**
 * Подпись АВР/ЭСФ для ИС ЭСФ КГД РК.
 *
 * ВАЖНО про формат: ИС ЭСФ ждёт НЕ обычный CMS и НЕ XMLDSig, а проприетарную
 * подпись «универсальной формы» — её эталонно делает класс КГД
 * UFormSignatureHelper.sign(body, credential) поверх Kalkan (см. SDK:
 * vstore-sdk → VstoreLocalService.generateSignature). Наш NCANode (верификатор
 * CMS) этот формат из коробки НЕ воспроизводит — поэтому raw-подпись через
 * NCANode давала 404/неверную подпись.
 *
 * Правильная схема — отдельный микросервис подписи УФ на нашем VPS (тот же,
 * где NCANode): по сути «localserver» из SDK КГД (Java + Kalkan), который
 * принимает signableData + ключ и возвращает { signedData, signature }.
 * Конфиг:
 *   ESF_SIGN_URL    — URL сервиса подписи УФ (POST JSON {signableData})
 *   ESF_SIGN_SECRET — секрет заголовка X-Esf-Sign-Secret
 *   ESF_SIGN_CERT_PEM — сертификат подписанта (PEM/base64) для createSession/upload
 *
 * Пока сервис не развёрнут — signAwpXml бросает понятную ошибку, и кнопка
 * «В ЭСФ» сообщает, что подпись ещё подключается (прод не «падает» 404-ом).
 */

const ESF_SIGN_URL = (process.env.ESF_SIGN_URL || "").replace(/\/$/, "")
const ESF_SIGN_SECRET = process.env.ESF_SIGN_SECRET || ""

export function esfSignerConfigured(): boolean {
  return !!ESF_SIGN_URL
}

export interface EsfSignResult {
  /** base64 подпись XML-представления документа (поле signature в uploadAwp) */
  signature: string
  /** PEM/base64 сертификата подписанта (поле x509Certificate) */
  certificatePem: string
}

/**
 * Подписать XML АВР через сервис подписи УФ.
 * Бросает понятную ошибку, если сервис не настроен или вернул не то.
 */
export async function signAwpXml(awpXml: string): Promise<EsfSignResult> {
  if (!ESF_SIGN_URL) {
    throw new Error(
      "Электронная подпись для ИС ЭСФ ещё подключается: нужен сервис подписи универсальной формы (КГД-формат UFormSignature). "
      + "Обычная CMS/NCANode-подпись здесь не подходит. Настройте ESF_SIGN_URL.",
    )
  }

  const res = await fetch(ESF_SIGN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ESF_SIGN_SECRET ? { "X-Esf-Sign-Secret": ESF_SIGN_SECRET } : {}),
    },
    body: JSON.stringify({ signableData: awpXml }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Сервис подписи ИС ЭСФ ответил ${res.status}: ${text.slice(0, 300)}`)
  }
  const data = (await res.json()) as { signature?: string; signedData?: string; certificate?: string }
  if (!data.signature) {
    throw new Error("Сервис подписи ИС ЭСФ вернул ответ без подписи")
  }
  return {
    signature: data.signature,
    certificatePem: data.certificate || process.env.ESF_SIGN_CERT_PEM || "",
  }
}
