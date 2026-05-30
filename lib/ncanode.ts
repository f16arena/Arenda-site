// Серверный клиент к NCANode (KalkanCrypt внутри) — строгая криптопроверка CMS-подписи
// НУЦ РК: математика ГОСТ-2015 + цепочка доверия + OCSP/CRL. Это тот самый sidecar-
// верификатор из lib/ncalayer-cms.verify.md, только на NCANode (а не PHP Kalkan).
//
// NCANode развёрнут на отдельном VPS (Алматы) и доступен ТОЛЬКО через Caddy по
// https://ecp.commrent.kz с секретным заголовком X-Ncanode-Secret (наружу 127.0.0.1).
// Поэтому клиент серверный: вызывать из server actions / route handlers, не из браузера.
//
// ENV:
//   NCANODE_URL     — базовый URL (по умолчанию https://ecp.commrent.kz)
//   NCANODE_SECRET  — значение заголовка X-Ncanode-Secret (обязательно)

const NCANODE_URL = (process.env.NCANODE_URL || "https://ecp.commrent.kz").replace(/\/$/, "")
const NCANODE_SECRET = process.env.NCANODE_SECRET || ""

export interface NcanodeSigner {
  commonName?: string
  iin?: string
  bin?: string
  organization?: string
  serialNumber?: string
  notBefore?: string
  notAfter?: string
  issuerCommonName?: string
  /** статус сертификата по OCSP, напр. "ACTIVE" */
  ocspStatus?: string
  /** метка доверенного времени (TSP), если есть */
  tspGenTime?: string
  /** серийный номер TSP-токена */
  tspSerial?: string
}

export interface NcanodeVerifyResult {
  /** Подпись математически верна, цепочка до НУЦ РК валидна, сертификат не отозван. */
  valid: boolean
  reason?: string
  signers: NcanodeSigner[]
  /** Сырой ответ NCANode — для аудита/диагностики. */
  raw?: unknown
}

// Свободная (tolerant) форма ответа NCANode 3.x — поля опциональны, парсим защитно.
interface RawCert {
  subject?: Record<string, string | undefined>
  issuer?: Record<string, string | undefined>
  notBefore?: string
  notAfter?: string
  serialNumber?: string
  valid?: boolean
}
interface RawSigner {
  certificate?: RawCert
  certificates?: RawCert[]
  ocsp?: { status?: string }
  tsp?: { genTime?: string; serialNumber?: string }
}
interface RawResponse {
  valid?: boolean
  status?: number | string
  message?: string
  error?: string
  signers?: RawSigner[]
}

function digits12(v: string | undefined): string | undefined {
  const m = String(v ?? "").match(/\d{12}/)
  return m ? m[0] : undefined
}

function normalize(json: RawResponse): NcanodeVerifyResult {
  const valid = json?.valid === true
  const signers: NcanodeSigner[] = (json?.signers ?? []).map((s) => {
    const cert = s?.certificate ?? (Array.isArray(s?.certificates) ? s.certificates[0] : undefined) ?? {}
    const subj = cert.subject ?? {}
    const iss = cert.issuer ?? {}
    return {
      commonName: subj.commonName ?? subj.cn,
      iin: subj.iin ?? digits12(subj.serialNumber),
      bin: subj.bin ?? subj.organizationIdentifier ?? digits12(subj.organizationIdentifier),
      organization: subj.organization ?? subj.o,
      serialNumber: cert.serialNumber,
      notBefore: cert.notBefore,
      notAfter: cert.notAfter,
      issuerCommonName: iss.commonName ?? iss.cn,
      ocspStatus: s?.ocsp?.status,
      tspGenTime: s?.tsp?.genTime,
      tspSerial: s?.tsp?.serialNumber,
    }
  })
  return { valid, reason: valid ? undefined : json?.message ?? json?.error ?? "Подпись недействительна", signers, raw: json }
}

/**
 * Криптопроверка CMS-подписи через NCANode. Для attached-подписи `dataB64` не нужен;
 * для detached — передать base64 подписанных данных. По умолчанию проверяет OCSP.
 * Никогда не бросает — при недоступности/ошибке возвращает { valid:false, reason }.
 */
export async function verifyCmsWithNcanode(
  cmsB64: string,
  opts?: { dataB64?: string; verifyOcsp?: boolean; verifyCrl?: boolean; timeoutMs?: number },
): Promise<NcanodeVerifyResult> {
  if (!NCANODE_SECRET) return { valid: false, reason: "NCANODE_SECRET не задан в окружении", signers: [] }
  if (!cmsB64) return { valid: false, reason: "Пустая подпись (CMS)", signers: [] }

  const body = {
    cms: cmsB64,
    data: opts?.dataB64 ?? null,
    verifyOcsp: opts?.verifyOcsp ?? true,
    verifyCrl: opts?.verifyCrl ?? false,
  }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 15_000)
  try {
    const res = await fetch(`${NCANODE_URL}/cms/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Ncanode-Secret": NCANODE_SECRET },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    let json: RawResponse
    try {
      json = (await res.json()) as RawResponse
    } catch {
      return { valid: false, reason: `NCANode вернул не-JSON (HTTP ${res.status})`, signers: [] }
    }
    if (!res.ok) return { valid: false, reason: `NCANode HTTP ${res.status}: ${json?.message ?? json?.error ?? "ошибка"}`, signers: [], raw: json }
    return normalize(json)
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError"
    return { valid: false, reason: aborted ? "NCANode не ответил вовремя (timeout)" : "NCANode недоступен: " + (e instanceof Error ? e.message : String(e)), signers: [] }
  } finally {
    clearTimeout(timer)
  }
}

/** Быстрая проверка доступности NCANode из приложения (для диагностики/настройки). */
export async function ncanodeHealth(): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!NCANODE_SECRET) return { ok: false, error: "NCANODE_SECRET не задан" }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 8_000)
  try {
    const res = await fetch(`${NCANODE_URL}/`, { headers: { "X-Ncanode-Secret": NCANODE_SECRET }, signal: ctrl.signal })
    return { ok: res.ok, status: res.status }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    clearTimeout(timer)
  }
}
