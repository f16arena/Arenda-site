"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { getT } from "@/lib/i18n/server"
import { revalidatePath } from "next/cache"

// Управление изображениями публичного сайта (лендинг). Платформенный уровень —
// только платформенный владелец. Картинки редактируются без передеплоя.

const MAX = 8 * 1024 * 1024 // 8 МБ
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"])

async function requirePlatformOwner() {
  const session = await auth()
  const { t } = await getT()
  if (!session?.user?.isPlatformOwner) throw new Error(t("actions.siteImages.platformOwnerOnly"))
}

export async function uploadSiteImage(slot: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformOwner()
  const { t } = await getT()
  const key = String(slot ?? "").trim()
  // slot — технический ключ картинки в БД, не переводится.
  if (!key) return { ok: false, error: t("actions.siteImages.slotRequired") }
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: t("actions.siteImages.imageRequired") }
  if (file.size > MAX) return { ok: false, error: t("actions.siteImages.tooBig") }
  if (!ALLOWED.has(file.type)) return { ok: false, error: t("actions.siteImages.badFormat") }

  const data = Buffer.from(await file.arrayBuffer())
  await db.siteImage.upsert({
    where: { slot: key },
    create: { slot: key, mime: file.type, fileName: file.name, data },
    update: { mime: file.type, fileName: file.name, data },
  })
  revalidatePath("/")
  revalidatePath("/superadmin/site-images")
  return { ok: true }
}

export async function removeSiteImage(slot: string): Promise<{ ok: boolean }> {
  await requirePlatformOwner()
  await db.siteImage.delete({ where: { slot } }).catch(() => {})
  revalidatePath("/")
  revalidatePath("/superadmin/site-images")
  return { ok: true }
}
