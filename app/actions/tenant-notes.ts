"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { assertTenantInOrg } from "@/lib/scope-guards"

/**
 * Внутренние заметки по арендатору («позвонил 5-го, обещал оплатить до 10-го»).
 * Видны только в админке — арендатор их не получает нигде.
 */
export async function updateTenantNotes(
  tenantId: string,
  notes: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireCapabilityAndFeature("tenants.editCompany")
    const { orgId } = await requireOrgAccess()
    await assertTenantInOrg(tenantId, orgId)

    const trimmed = notes.trim().slice(0, 5000)
    await db.tenant.update({
      where: { id: tenantId },
      data: { internalNotes: trimmed || null },
    })
    revalidatePath(`/admin/tenants/${tenantId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось сохранить заметки" }
  }
}
