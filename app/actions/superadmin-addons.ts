"use server"

import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import { notifyUser } from "@/lib/notify"
import { ADDON_CATALOG } from "@/lib/addons-catalog"
import { revalidatePath } from "next/cache"

/**
 * Активировать аддон (после ручной оплаты).
 * isActive=true, startedAt=now, expiresAt опционально.
 */
export async function activateAddon(input: {
  addonId: string
  expiresAt?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformOwner()

  const addon = await db.organizationAddon.findUnique({
    where: { id: input.addonId },
    include: { organization: { select: { id: true, name: true, ownerUserId: true } } },
  })
  if (!addon) return { ok: false, error: "Аддон не найден" }

  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return { ok: false, error: "Некорректная дата" }

  await db.organizationAddon.update({
    where: { id: input.addonId },
    data: {
      isActive: true,
      startedAt: new Date(),
      expiresAt,
      notes: addon.notes ? `${addon.notes}\n[активирован супер-админом]` : "[активирован супер-админом]",
    },
  })

  if (addon.organization.ownerUserId) {
    const item = ADDON_CATALOG.find((a) => a.code === addon.addonCode)
    await notifyUser({
      userId: addon.organization.ownerUserId,
      type: "ADDON_ACTIVATED",
      title: `Аддон активирован: ${item?.label ?? addon.addonCode}`,
      message: `Ваш аддон «${item?.label ?? addon.addonCode}» (${addon.priceMonthly} ₸/мес × ${addon.quantity}) активирован.`,
      link: "/admin/subscription",
      sendEmail: false,
    }).catch(() => null)
  }

  revalidatePath("/superadmin/addons")
  revalidatePath(`/superadmin/orgs/${addon.organization.id}`)
  revalidatePath("/admin/subscription")
  return { ok: true }
}

/** Деактивировать аддон (или отказать в заявке). */
export async function deactivateAddon(input: {
  addonId: string
  reject?: boolean
  reason?: string
}): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformOwner()

  const addon = await db.organizationAddon.findUnique({
    where: { id: input.addonId },
    include: { organization: { select: { id: true, name: true, ownerUserId: true } } },
  })
  if (!addon) return { ok: false, error: "Аддон не найден" }

  if (input.reject && !addon.isActive) {
    // Заявка не подтверждена — удаляем.
    await db.organizationAddon.delete({ where: { id: input.addonId } })
  } else {
    await db.organizationAddon.update({
      where: { id: input.addonId },
      data: {
        isActive: false,
        expiresAt: new Date(),
        notes: addon.notes
          ? `${addon.notes}\n[деактивирован: ${input.reason ?? "—"}]`
          : `[деактивирован: ${input.reason ?? "—"}]`,
      },
    })
  }

  if (addon.organization.ownerUserId) {
    const item = ADDON_CATALOG.find((a) => a.code === addon.addonCode)
    await notifyUser({
      userId: addon.organization.ownerUserId,
      type: input.reject ? "ADDON_REJECTED" : "ADDON_DEACTIVATED",
      title: input.reject
        ? `Заявка отклонена: ${item?.label ?? addon.addonCode}`
        : `Аддон деактивирован: ${item?.label ?? addon.addonCode}`,
      message: input.reason ?? (input.reject ? "Заявка не была подтверждена." : "Аддон отключён."),
      link: "/admin/subscription",
      sendEmail: false,
    }).catch(() => null)
  }

  revalidatePath("/superadmin/addons")
  revalidatePath(`/superadmin/orgs/${addon.organization.id}`)
  revalidatePath("/admin/subscription")
  return { ok: true }
}
