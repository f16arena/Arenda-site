import "server-only"

import { createAuthTicket, createSessionSigned } from "./client"
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
  const ticket = await createAuthTicket(cfg.signerIin, cfg.wsUsername, cfg.wsPassword)
  const signedTicket = await signTicketXml(ticket, { certPath: cfg.certPath, certPin: cfg.certPin })
  return createSessionSigned(cfg.tin, signedTicket, cfg.wsUsername, cfg.wsPassword)
}
