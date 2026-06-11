"use server"

import { revalidatePath, revalidateTag } from "next/cache"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { ADMIN_SHELL_CACHE_TAG } from "@/lib/admin-shell-cache"

/**
 * Брендирование: логотип организации в сайдбаре. Принимает data-URL картинки
 * (фронт сам ужимает до ~256px) или null — убрать логотип (вернётся Commrent).
 * Только владелец.
 */
export async function updateOrgLogo(
  dataUrl: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user || session.user.role !== "OWNER") {
    return { ok: false, error: "Логотип может менять только владелец" }
  }
  const { orgId } = await requireOrgAccess()
  if (!orgId) return { ok: false, error: "Организация не определена" }

  if (dataUrl !== null) {
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl)) {
      return { ok: false, error: "Поддерживаются PNG, JPG или WebP" }
    }
    // ~300КБ base64 ≈ 220КБ бинаря — больше логотипу не нужно
    if (dataUrl.length > 300_000) {
      return { ok: false, error: "Логотип слишком большой — попробуйте картинку поменьше" }
    }
  }

  await db.organization.update({
    where: { id: orgId },
    data: { logoUrl: dataUrl },
  })

  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
  revalidatePath("/admin/settings")
  return { ok: true }
}
