"use server"

import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { lookupTaxpayer, type TaxpayerInfo } from "@/lib/kgd"

/**
 * Автозаполнение реквизитов арендатора по ИИН/БИН из справочника КГД.
 * Доступно сотрудникам организации (не арендаторам).
 */
export async function lookupTaxpayerAction(
  taxId: string,
): Promise<{ ok: true; info: TaxpayerInfo } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") return { ok: false, error: "Не авторизован" }
  await requireOrgAccess()
  return lookupTaxpayer(taxId)
}
