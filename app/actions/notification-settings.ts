"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

export interface NotificationSettings {
  notifyEmail: boolean
  notifyTelegram: boolean
  notifyInApp: boolean
  notifySms: boolean
  /** Список muted-типов событий — если в нём type, уведомление этого типа НЕ присылается */
  mutedTypes: string[]
}

const DEFAULTS: NotificationSettings = {
  notifyEmail: true,
  notifyTelegram: true,
  notifyInApp: true,
  notifySms: false,
  mutedTypes: [],
}

export async function getMyNotificationSettings(): Promise<NotificationSettings> {
  const session = await auth()
  if (!session?.user) return DEFAULTS

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { notifyEmail: true, notifyTelegram: true, notifyInApp: true, notifySms: true, notifyMutedTypes: true },
  }).catch(() => null)
  if (!user) return DEFAULTS

  let mutedTypes: string[] = []
  if (Array.isArray(user.notifyMutedTypes)) {
    mutedTypes = user.notifyMutedTypes.filter((x): x is string => typeof x === "string")
  }
  return {
    notifyEmail: user.notifyEmail ?? true,
    notifyTelegram: user.notifyTelegram ?? true,
    notifyInApp: user.notifyInApp ?? true,
    notifySms: user.notifySms ?? false,
    mutedTypes,
  }
}

export async function updateMyNotificationSettings(
  settings: Partial<NotificationSettings>,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }

  await db.user.update({
    where: { id: session.user.id },
    data: {
      ...(typeof settings.notifyEmail === "boolean" ? { notifyEmail: settings.notifyEmail } : {}),
      ...(typeof settings.notifyTelegram === "boolean" ? { notifyTelegram: settings.notifyTelegram } : {}),
      ...(typeof settings.notifyInApp === "boolean" ? { notifyInApp: settings.notifyInApp } : {}),
      ...(typeof settings.notifySms === "boolean" ? { notifySms: settings.notifySms } : {}),
      ...(settings.mutedTypes ? { notifyMutedTypes: settings.mutedTypes } : {}),
    },
  })

  revalidatePath("/admin/profile")
  revalidatePath("/cabinet/profile")
  revalidatePath("/superadmin/profile")
  return { ok: true }
}
