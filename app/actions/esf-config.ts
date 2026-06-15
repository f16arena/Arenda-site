"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { encryptSecret } from "@/lib/secret-crypto"

/**
 * Сохранить реквизиты ИС ЭСФ организации (Настройки → ЭСФ). Только владелец.
 * Секреты (пароль учётки, PIN контейнера) шифруются. Пустое поле секрета =
 * «не менять» (чтобы не стирать уже сохранённый секрет при редактировании).
 */
export async function saveOrgEsfConfig(formData: FormData): Promise<{ success: true } | { error: string }> {
  const session = await auth()
  if (!session?.user || (session.user.role !== "OWNER" && !session.user.isPlatformOwner)) {
    return { error: "Настройка ЭСФ доступна только владельцу" }
  }
  const { orgId } = await requireOrgAccess()

  const enabled = formData.get("enabled") === "on" || formData.get("enabled") === "1"
  const wsUsername = String(formData.get("wsUsername") ?? "").trim()
  const signerIin = String(formData.get("signerIin") ?? "").replace(/\D/g, "")
  const certPath = String(formData.get("certPath") ?? "").trim()
  const wsPassword = String(formData.get("wsPassword") ?? "")
  const certPin = String(formData.get("certPin") ?? "")

  if (signerIin && signerIin.length !== 12) {
    return { error: "ИИН подписанта должен содержать 12 цифр" }
  }

  const data: {
    enabled: boolean
    wsUsername: string | null
    signerIin: string | null
    certPath: string | null
    wsPasswordEnc?: string
    certPinEnc?: string
    certDataEnc?: string
    certFileName?: string
  } = {
    enabled,
    wsUsername: wsUsername || null,
    signerIin: signerIin || null,
    certPath: certPath || null,
  }
  // Секреты обновляем только если их ввели заново (иначе оставляем как было).
  if (wsPassword) data.wsPasswordEnc = encryptSecret(wsPassword)
  if (certPin) data.certPinEnc = encryptSecret(certPin)

  // Загрузка ключа .p12 из кабинета: шифруем base64 и сохраняем. Пустой файл =
  // не менять уже загруженный ключ.
  const certFile = formData.get("certFile")
  if (certFile instanceof File && certFile.size > 0) {
    const name = certFile.name.toLowerCase()
    if (!name.endsWith(".p12") && !name.endsWith(".pfx")) {
      return { error: "Ключ должен быть файлом .p12 или .pfx" }
    }
    if (certFile.size > 256 * 1024) {
      return { error: "Файл ключа слишком большой (ожидается .p12 до 256 КБ)" }
    }
    const base64 = Buffer.from(await certFile.arrayBuffer()).toString("base64")
    data.certDataEnc = encryptSecret(base64)
    data.certFileName = certFile.name.slice(0, 200)
  }

  await db.orgEsfConfig.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...data },
    update: data,
  })

  revalidatePath("/admin/settings")
  return { success: true }
}
