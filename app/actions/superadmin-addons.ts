"use server"

import { db } from "@/lib/db"
import { requirePlatformOwner } from "@/lib/org"
import { notifyUser } from "@/lib/notify"
import { ADDON_CATALOG } from "@/lib/addons-catalog"
import { revalidatePath } from "next/cache"
import { getT, getTForUser } from "@/lib/i18n/server"

/**
 * Активировать аддон (после ручной оплаты).
 * isActive=true, startedAt=now, expiresAt опционально.
 */
export async function activateAddon(input: {
  addonId: string
  expiresAt?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const { t } = await getT()
  await requirePlatformOwner()

  const addon = await db.organizationAddon.findUnique({
    where: { id: input.addonId },
    include: { organization: { select: { id: true, name: true, ownerUserId: true } } },
  })
  if (!addon) return { ok: false, error: t("actions.addons.notFound") }

  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return { ok: false, error: t("actions.common.badDate") }

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
    // Уведомление читает владелец организации — берём язык получателя.
    const { t: tOwner } = await getTForUser(addon.organization.ownerUserId)
    await notifyUser({
      userId: addon.organization.ownerUserId,
      type: "ADDON_ACTIVATED",
      title: tOwner("actions.addons.activatedTitle", { addon: item?.label ?? addon.addonCode }),
      message: tOwner("actions.addons.activatedMessage", {
        addon: item?.label ?? addon.addonCode,
        price: addon.priceMonthly,
        count: addon.quantity,
      }),
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
  const { t } = await getT()
  await requirePlatformOwner()

  const addon = await db.organizationAddon.findUnique({
    where: { id: input.addonId },
    include: { organization: { select: { id: true, name: true, ownerUserId: true } } },
  })
  if (!addon) return { ok: false, error: t("actions.addons.notFound") }

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
    // Уведомление читает владелец организации — берём язык получателя.
    const { t: tOwner } = await getTForUser(addon.organization.ownerUserId)
    await notifyUser({
      userId: addon.organization.ownerUserId,
      type: input.reject ? "ADDON_REJECTED" : "ADDON_DEACTIVATED",
      title: input.reject
        ? tOwner("actions.addons.rejectedTitle", { addon: item?.label ?? addon.addonCode })
        : tOwner("actions.addons.deactivatedTitle", { addon: item?.label ?? addon.addonCode }),
      message: input.reason ?? (input.reject
        ? tOwner("actions.addons.rejectedMessage")
        : tOwner("actions.addons.deactivatedMessage")),
      link: "/admin/subscription",
      sendEmail: false,
    }).catch(() => null)
  }

  revalidatePath("/superadmin/addons")
  revalidatePath(`/superadmin/orgs/${addon.organization.id}`)
  revalidatePath("/admin/subscription")
  return { ok: true }
}
