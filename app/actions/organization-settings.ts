"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireAdmin } from "@/lib/permissions"

export async function updateOrganizationVat(orgId: string, formData: FormData) {
  await requireAdmin()
  const { orgId: scopeOrgId } = await requireOrgAccess()
  if (scopeOrgId !== orgId) throw new Error("Нет доступа к этой организации")

  const isVatPayer = formData.get("isVatPayer") === "on"
  const vatRateStr = formData.get("vatRate") as string
  const vatNumber = String(formData.get("vatNumber") ?? "").trim()

  const vatRate = vatRateStr ? Math.max(0, Math.min(100, parseFloat(vatRateStr))) : 12

  await db.organization.update({
    where: { id: orgId },
    data: {
      isVatPayer,
      vatRate,
      vatNumber: vatNumber || null,
    },
  })

  revalidatePath("/admin/settings")
  return { success: true }
}
