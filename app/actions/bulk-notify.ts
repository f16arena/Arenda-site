"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { notifyUser } from "@/lib/notify"
import { tenantScope } from "@/lib/tenant-scope"
import { revalidatePath } from "next/cache"

/**
 * Массовая рассылка арендаторам: in-app уведомление каждому, опционально email.
 * Gate: фича bulkNotifications в плане организации (Starter+).
 */
export async function sendBulkNotificationToTenants(input: {
  scope: "all" | "selected" | "debtors"
  tenantIds?: string[]
  title: string
  message: string
  link?: string
  alsoEmail?: boolean
}): Promise<{ ok: boolean; sent?: number; skipped?: number; error?: string }> {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") {
    return { ok: false, error: "Не авторизован" }
  }
  const { orgId } = await requireOrgAccess()

  // Gate: фича тарифа
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { plan: { select: { features: true } } },
  })
  let allowed = false
  try {
    allowed = JSON.parse(org?.plan?.features ?? "{}")?.bulkNotifications === true
  } catch { /* ignore */ }
  if (!allowed) {
    return { ok: false, error: "Массовые рассылки недоступны в текущем тарифе. Обновите до Starter или выше." }
  }

  const title = input.title?.trim() ?? ""
  const message = input.message?.trim() ?? ""
  if (!title || !message) return { ok: false, error: "Заголовок и текст обязательны" }

  // Выбор арендаторов: выделенные / только должники / все видимые в скоупе организации.
  const where = input.scope === "selected" && input.tenantIds?.length
    ? { id: { in: input.tenantIds }, ...tenantScope(orgId) }
    : input.scope === "debtors"
      ? { ...tenantScope(orgId), charges: { some: { isPaid: false, deletedAt: null } } }
      : tenantScope(orgId)

  const tenants = await db.tenant.findMany({
    where,
    select: { id: true, user: { select: { id: true } } },
  })

  let sent = 0
  let skipped = 0
  for (const t of tenants) {
    if (!t.user?.id) { skipped++; continue }
    try {
      await notifyUser({
        userId: t.user.id,
        type: "BULK_INFO",
        title,
        message,
        link: input.link,
        sendEmail: !!input.alsoEmail,
      })
      sent++
    } catch {
      skipped++
    }
  }

  revalidatePath("/admin/tenants")
  return { ok: true, sent, skipped }
}
