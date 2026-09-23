"use server"

import { revalidatePath } from "next/cache"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { spaceScope } from "@/lib/tenant-scope"
import { getT } from "@/lib/i18n/server"
import { getAllowedCapabilityKeysForUser } from "@/lib/capabilities"

const MAX_PHOTOS = 8
const MAX_PHOTO_LEN = 600_000 // ~440КБ бинаря на фото после клиентского сжатия

async function assertCanEditSpaces(orgId: string, userId: string, role: string, isPlatformOwner: boolean) {
  const { t } = await getT()
  if (role === "OWNER" || isPlatformOwner) return
  const caps = new Set(await getAllowedCapabilityKeysForUser({ userId, role, isPlatformOwner, orgId }))
  if (!caps.has("spaces.edit")) throw new Error(t("actions.spacePhotos.noEditRight"))
}

/**
 * Сохранить фото помещения. photos — массив data-URL (PNG/JPEG/WebP),
 * сжатых на клиенте. Полностью заменяет набор фото.
 */
export async function saveSpacePhotos(
  spaceId: string,
  photos: string[],
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const session = await auth()
  const { t } = await getT()
  if (!session?.user || session.user.role === "TENANT") return { ok: false, error: t("actions.common.noAccess") }
  const { orgId } = await requireOrgAccess()
  if (!orgId) return { ok: false, error: t("actions.common.organizationUndefined") }

  try {
    await assertCanEditSpaces(orgId, session.user.id, session.user.role, session.user.isPlatformOwner ?? false)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t("actions.common.noRights") }
  }

  // Помещение принадлежит организации?
  const space = await db.space.findFirst({
    where: { AND: [spaceScope(orgId), { id: spaceId }] },
    select: { id: true },
  })
  if (!space) return { ok: false, error: t("actions.common.spaceNotFound") }

  const clean = photos.slice(0, MAX_PHOTOS).filter((p) => {
    return /^data:image\/(png|jpeg|webp);base64,/.test(p) && p.length <= MAX_PHOTO_LEN
  })

  await db.space.update({
    where: { id: spaceId },
    data: { photos: clean.length > 0 ? JSON.stringify(clean) : null },
  })

  revalidatePath("/admin/spaces")
  return { ok: true, count: clean.length }
}
