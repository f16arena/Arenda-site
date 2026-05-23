"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { notifyUser } from "@/lib/notify"
import { ADDON_CATALOG } from "@/lib/addons-catalog"
import { revalidatePath } from "next/cache"

/**
 * Создаёт заявку на аддон: OrganizationAddon(isActive=false, notes="…")
 * + уведомление платформ-админу. Платежи вручную, поэтому супер-админ
 * вручную активирует аддон (isActive=true) после оплаты.
 */
export async function requestAddon(input: {
  addonCode: string
  quantity?: number
  notes?: string
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") {
    return { ok: false, error: "Не авторизован" }
  }
  const { orgId } = await requireOrgAccess()

  const item = ADDON_CATALOG.find((a) => a.code === input.addonCode)
  if (!item) return { ok: false, error: "Аддон не найден" }

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { name: true, plan: { select: { code: true } } },
  })
  if (!org) return { ok: false, error: "Организация не найдена" }
  const planCode = org.plan?.code
  if (item.requiresPlan && (!planCode || !item.requiresPlan.includes(planCode))) {
    return { ok: false, error: `Аддон требует тариф: ${item.requiresPlan.join(" / ")}` }
  }

  const quantity = Math.max(1, Math.min(50, input.quantity ?? 1))

  await db.organizationAddon.create({
    data: {
      organizationId: orgId,
      addonCode: item.code,
      quantity,
      priceMonthly: item.priceMonthly,
      isActive: false,
      notes: input.notes?.trim() || `Заявка от ${session.user.name ?? session.user.email ?? "клиента"}; ожидает подтверждения супер-админа`,
    },
  })

  // Уведомление платформ-админам.
  const platformOwners = await db.user.findMany({
    where: { isPlatformOwner: true, isActive: true },
    select: { id: true },
  })
  await Promise.all(platformOwners.map((u) =>
    notifyUser({
      userId: u.id,
      type: "ADDON_REQUEST",
      title: `Заявка на аддон: ${item.label}`,
      message: `${org.name} запросил «${item.label}» (${item.priceMonthly} ₸/мес × ${quantity}). Тариф: ${planCode ?? "—"}.`,
      link: "/superadmin/orgs",
      sendEmail: false,
    }).catch(() => null),
  ))

  revalidatePath("/admin/subscription")
  return { ok: true }
}
