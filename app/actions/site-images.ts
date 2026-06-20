"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

// Управление изображениями публичного сайта (лендинг). Платформенный уровень —
// только платформенный владелец. Картинки редактируются без передеплоя.

const MAX = 8 * 1024 * 1024 // 8 МБ
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"])

async function requirePlatformOwner() {
  const session = await auth()
  if (!session?.user?.isPlatformOwner) throw new Error("Доступ только для платформенного владельца")
}

export async function uploadSiteImage(slot: string, formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformOwner()
  const key = String(slot ?? "").trim()
  if (!key) return { ok: false, error: "Не указан slot" }
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Прикрепите изображение" }
  if (file.size > MAX) return { ok: false, error: "Размер больше 8 МБ" }
  if (!ALLOWED.has(file.type)) return { ok: false, error: "Только PNG, JPEG, WEBP или AVIF" }

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
