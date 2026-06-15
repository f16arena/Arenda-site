import "server-only"

import { db } from "@/lib/db"
import { decryptSecret } from "@/lib/secret-crypto"

/**
 * Рантайм-реквизиты ЭСФ организации. Источник — таблица OrgEsfConfig (секреты
 * расшифровываются). Для bootstrap-организации (нет своей записи) — fallback на
 * env, чтобы текущая единственная орг работала без ввода в кабинете.
 */
export interface OrgEsfRuntimeConfig {
  tin: string // БИН организации (createSessionSigned, uploadAwp)
  wsUsername: string
  wsPassword: string
  signerIin: string // ИИН физлица-владельца ключа (createAuthTicket)
  certPath: string
  certPin: string
  // Загруженный из кабинета .p12 (base64). Если задан — приоритетнее certPath
  // (VPS-подписант принимает ключ байтами).
  certData: string
}

export async function resolveOrgEsfConfig(
  orgId: string,
  orgTin: string,
): Promise<{ ok: true; config: OrgEsfRuntimeConfig } | { ok: false; error: string }> {
  const row = await db.orgEsfConfig.findUnique({ where: { organizationId: orgId } }).catch(() => null)

  const wsUsername = (row?.wsUsername || process.env.ESF_WS_USERNAME || "").trim()
  const wsPassword = row?.wsPasswordEnc ? decryptSecret(row.wsPasswordEnc) : (process.env.ESF_WS_PASSWORD || "")
  const signerIin = (row?.signerIin || process.env.ESF_SIGNER_IIN || "").replace(/\D/g, "")
  const certPath = (row?.certPath || process.env.ESF_SIGN_CERT_PATH || "").trim()
  const certPin = row?.certPinEnc ? decryptSecret(row.certPinEnc) : (process.env.ESF_SIGN_CERT_PIN || "")
  const certData = row?.certDataEnc ? decryptSecret(row.certDataEnc) : ""
  // Если есть запись — уважаем её флаг enabled; если записи нет, считаем
  // включённой при наличии env (bootstrap-орг).
  const enabled = row ? row.enabled : !!(wsUsername && wsPassword && certPath)

  if (!enabled) {
    return { ok: false, error: "Интеграция с ИС ЭСФ для организации не настроена (Настройки → ЭСФ)." }
  }
  // createSessionSigned ТРЕБУЕТ WS-Security UsernameToken (учётка ЭСФ).
  if (!wsUsername || !wsPassword) {
    return { ok: false, error: "Не указаны логин/пароль учётки ИС ЭСФ (Настройки → ЭСФ)." }
  }
  if (signerIin.length !== 12) {
    return { ok: false, error: "Не указан ИИН подписанта (12 цифр) в настройках ЭСФ." }
  }
  if (!certData && !certPath) {
    return { ok: false, error: "Не загружен ключ ЭЦП организации (Настройки → ЭСФ)." }
  }

  return { ok: true, config: { tin: orgTin, wsUsername, wsPassword, signerIin, certPath, certPin, certData } }
}
