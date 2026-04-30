"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

export interface NotificationSettings {
  notifyEmail: boolean
  notifyTelegram: boolean
  notifyInApp: boolean
  /** Список muted-типов событий — если в нём type, уведомление этого типа НЕ присылается */
  mutedTypes: string[]
}

export async function getMyNotificationSettings(): Promise<NotificationSettings> {
  const session = await auth()
  if (!session?.user) {
    return { notifyEmail: true, notifyTelegram: true, notifyInApp: true, mutedTypes: [] }
  }
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { notifyEmail: true, notifyTelegram: true, notifyInApp: true, notifyMutedTypes: true },
  }).catch(() => null)
  if (!user) {
    return { notifyEmail: true, notifyTelegram: true, notifyInApp: true, mutedTypes: [] }
  }
  let mutedTypes: string[] = []
  if (Array.isArray(user.notifyMutedTypes)) {
    mutedTypes = user.notifyMutedTypes.filter((x): x is string => typeof x === "string")
  }
  return {
    notifyEmail: user.notifyEmail ?? true,
    notifyTelegram: user.notifyTelegram ?? true,
    notifyInApp: user.notifyInApp ?? true,
    mutedTypes,
  }
}

export async function updateMyNotificationSettings(
  settings: Partial<NotificationSettings>
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }

  await db.user.update({
    where: { id: session.user.id },
    data: {
      ...(typeof settings.notifyEmail === "boolean" ? { notifyEmail: settings.notifyEmail } : {}),
      ...(typeof settings.notifyTelegram === "boolean" ? { notifyTelegram: settings.notifyTelegram } : {}),
      ...(typeof settings.notifyInApp === "boolean" ? { notifyInApp: settings.notifyInApp } : {}),
      ...(settings.mutedTypes ? { notifyMutedTypes: settings.mutedTypes } : {}),
    },
  })

  revalidatePath("/admin/profile")
  revalidatePath("/cabinet/profile")
  revalidatePath("/superadmin/profile")
  return { ok: true }
}
