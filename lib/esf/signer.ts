import "server-only"

/**
 * Серверная подпись АВР для ИС ЭСФ через NCANode (наш VPS, см. lib/ncanode.ts).
 * ИС ЭСФ ждёт «ЭЦП XML-представления АВР» — компактную raw ГОСТ/RSA подпись
 * (base64, ≤400 символов), НЕ CMS и НЕ XMLDSig.
 *
 * Ключ организации (p12 ЭЦП юрлица/ИП, GOSTKNCA) хранится в env (этап 1 —
 * один владелец; этап 2 — шифрованно в БД по организациям):
 *   ESF_SIGN_P12_BASE64 — p12 в base64
 *   ESF_SIGN_P12_PASSWORD — пароль контейнера
 *   NCANODE_URL / NCANODE_SECRET — как в lib/ncanode.ts
 *
 * NB: точный путь NCANode для raw-подписи проверяется на обкатке (v3:
 * /raw/sign — если в нашей сборке отличается, поправить NCANODE_RAW_SIGN_PATH).
 */

const NCANODE_URL = (process.env.NCANODE_URL || "https://ecp.commrent.kz").replace(/\/$/, "")
const NCANODE_SECRET = process.env.NCANODE_SECRET || ""
const RAW_SIGN_PATH = process.env.NCANODE_RAW_SIGN_PATH || "/raw/sign"

export function esfSignerConfigured(): boolean {
  return !!(process.env.ESF_SIGN_P12_BASE64 && process.env.ESF_SIGN_P12_PASSWORD && NCANODE_SECRET)
}

export interface EsfSignResult {
  /** base64 raw-подпись данных */
  signature: string
  /** PEM/base64 сертификата подписанта (для x509Certificate в запросах ЭСФ) */
  certificatePem: string
}

/** Подписать XML АВР ключом организации. Бросает понятную ошибку, если подпись не настроена. */
export async function signAwpXml(awpXml: string): Promise<EsfSignResult> {
  const p12 = process.env.ESF_SIGN_P12_BASE64
  const password = process.env.ESF_SIGN_P12_PASSWORD
  if (!p12 || !password) {
    throw new Error(
      "Подпись для ИС ЭСФ не настроена: добавьте ESF_SIGN_P12_BASE64 и ESF_SIGN_P12_PASSWORD (ЭЦП организации) в переменные окружения",
    )
  }
  if (!NCANODE_SECRET) {
    throw new Error("NCANODE_SECRET не настроен — серверная подпись недоступна")
  }

  const res = await fetch(`${NCANODE_URL}${RAW_SIGN_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Ncanode-Secret": NCANODE_SECRET,
    },
    body: JSON.stringify({
      data: Buffer.from(awpXml, "utf8").toString("base64"),
      signers: [{ key: p12, password }],
      withTsp: false,
    }),
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`NCANode не смог подписать АВР (${res.status}): ${text.slice(0, 300)}`)
  }
  const data = (await res.json()) as { signature?: string; sign?: string; certificate?: string; signers?: Array<{ certificate?: string }> }
  const signature = data.signature || data.sign
  const certificatePem = data.certificate || data.signers?.[0]?.certificate || extractCertFromP12Fallback()
  if (!signature) {
    throw new Error("NCANode вернул ответ без подписи — проверьте NCANODE_RAW_SIGN_PATH и формат запроса")
  }
  return { signature, certificatePem: certificatePem ?? "" }
}

/** Сертификат подписанта обязателен для createSession/uploadAwp — берём из env, если NCANode не вернул. */
function extractCertFromP12Fallback(): string | null {
  return process.env.ESF_SIGN_CERT_PEM ?? null
}
