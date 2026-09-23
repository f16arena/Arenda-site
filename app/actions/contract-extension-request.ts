"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notifyUser } from "@/lib/notify"
import { getT, getTForUser } from "@/lib/i18n/server"
import { formatDateL } from "@/lib/i18n/format"

/**
 * Арендатор просит продлить договор (кнопка в кабинете). Владелец и админы
 * организации получают уведомление со ссылкой на карточку арендатора, где
 * продление оформляется в 1 клик (ДС EXTEND_TERM).
 */
export async function requestContractExtension(
  contractId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Переводчик нужен и в catch — объявляем до try.
  const { t } = await getT()
  try {
    const session = await auth()
    if (!session?.user) return { ok: false, error: t("actions.common.noAccess") }

    const tenant = await db.tenant.findUnique({
      where: { userId: session.user.id },
      select: { id: true, companyName: true, user: { select: { organizationId: true } } },
    })
    if (!tenant) return { ok: false, error: t("actions.common.tenantProfileNotFound") }

    const contract = await db.contract.findFirst({
      where: { id: contractId, tenantId: tenant.id, deletedAt: null, status: "SIGNED" },
      select: { number: true, endDate: true },
    })
    if (!contract) return { ok: false, error: t("actions.contractExtension.contractNotSigned") }

    const orgId = tenant.user.organizationId
    if (!orgId) return { ok: false, error: t("actions.common.organizationNotFound") }

    const staff = await db.user.findMany({
      where: { organizationId: orgId, isActive: true, role: { in: ["OWNER", "ADMIN"] } },
      select: { id: true },
    })
    for (const s of staff) {
      // Уведомление читает сотрудник — берём язык получателя, а не арендатора.
      const { t: tStaff, locale } = await getTForUser(s.id)
      await notifyUser({
        userId: s.id,
        type: "EXTENSION_REQUEST",
        title: tStaff("actions.contractExtension.notifyTitle", { tenant: tenant.companyName }),
        message: contract.endDate
          ? tStaff("actions.contractExtension.notifyMessageWithDate", {
              number: contract.number,
              date: formatDateL(locale, contract.endDate),
            })
          : tStaff("actions.contractExtension.notifyMessage", { number: contract.number }),
        link: `/admin/tenants/${tenant.id}`,
        dedupWindowHours: 24,
      }).catch(() => {})
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t("actions.contractExtension.sendFailed") }
  }
}
