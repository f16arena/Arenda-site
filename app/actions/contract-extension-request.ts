"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notifyUser } from "@/lib/notify"

/**
 * Арендатор просит продлить договор (кнопка в кабинете). Владелец и админы
 * организации получают уведомление со ссылкой на карточку арендатора, где
 * продление оформляется в 1 клик (ДС EXTEND_TERM).
 */
export async function requestContractExtension(
  contractId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await auth()
    if (!session?.user) return { ok: false, error: "Не авторизован" }

    const tenant = await db.tenant.findUnique({
      where: { userId: session.user.id },
      select: { id: true, companyName: true, user: { select: { organizationId: true } } },
    })
    if (!tenant) return { ok: false, error: "Профиль арендатора не найден" }

    const contract = await db.contract.findFirst({
      where: { id: contractId, tenantId: tenant.id, deletedAt: null, status: "SIGNED" },
      select: { number: true, endDate: true },
    })
    if (!contract) return { ok: false, error: "Договор не найден или ещё не подписан" }

    const orgId = tenant.user.organizationId
    if (!orgId) return { ok: false, error: "Организация не найдена" }

    const staff = await db.user.findMany({
      where: { organizationId: orgId, isActive: true, role: { in: ["OWNER", "ADMIN"] } },
      select: { id: true },
    })
    for (const s of staff) {
      await notifyUser({
        userId: s.id,
        type: "EXTENSION_REQUEST",
        title: `Запрос продления: ${tenant.companyName}`,
        message: `Арендатор просит продлить договор № ${contract.number}${contract.endDate ? ` (истекает ${new Date(contract.endDate).toLocaleDateString("ru-RU")})` : ""}. Продление в 1 клик — кнопка «Продлить» на карточке арендатора.`,
        link: `/admin/tenants/${tenant.id}`,
        dedupWindowHours: 24,
      }).catch(() => {})
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось отправить запрос" }
  }
}
