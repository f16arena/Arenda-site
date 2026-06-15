import "server-only"

import { createAuthTicket, createSessionSigned, closeSessionByCredentials } from "./client"
import { signTicketXml } from "./signer"
import type { OrgEsfRuntimeConfig } from "./config"

/**
 * Открыть сессию ИС ЭСФ под объединённым ГОСТ-2015 ключом (новый протокол):
 *   1) createAuthTicket(iin) → тикет
 *   2) подпись тикета xmlDsig (VPS-jar) → signedAuthTicket
 *   3) createSessionSigned(tin, signedAuthTicket) → sessionId
 * Реквизиты — per-org (lib/esf/config). Возвращает sessionId.
 */
export async function openEsfSession(cfg: OrgEsfRuntimeConfig): Promise<string> {
  // Подчищаем возможную «зависшую» сессию этого пользователя, иначе КГД отвечает
  // "User already has opened session". Best-effort.
  await closeSessionByCredentials(cfg.tin, cfg.wsUsername, cfg.wsPassword)
  const ticket = await createAuthTicket(cfg.signerIin)
  const signedTicket = await signTicketXml(ticket, { certPath: cfg.certPath, certPin: cfg.certPin, certData: cfg.certData })
  return createSessionSigned(cfg.tin, signedTicket, cfg.wsUsername, cfg.wsPassword)
}
