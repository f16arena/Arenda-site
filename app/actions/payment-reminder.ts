"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { assertTenantInOrg } from "@/lib/scope-guards"
import { notifyUser } from "@/lib/notify"
import { getT, getTForUser } from "@/lib/i18n/server"
import { formatDateL, formatMoneyL } from "@/lib/i18n/format"

/**
 * Точечное напоминание об оплате конкретному арендатору: in-app + email
 * со сводкой долга и ссылкой на кабинет (реквизиты и QR — там).
 * Дедуп 20 часов — повторный клик в тот же день не спамит.
 */
export async function remindTenantPayment(
  tenantId: string,
): Promise<{ ok: true; debt: number } | { ok: false; error: string }> {
  // Переводчик нужен и в catch — объявляем до try.
  const { t } = await getT()
  try {
    const session = await auth()
    if (!session?.user || session.user.role === "TENANT") return { ok: false, error: t("actions.common.noAccess") }
    const { orgId } = await requireOrgAccess()
    await assertTenantInOrg(tenantId, orgId)

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { companyName: true, userId: true },
    })
    if (!tenant?.userId) return { ok: false, error: t("actions.paymentReminder.noTenantUser") }

    const debtAgg = await db.charge.aggregate({
      where: { tenantId, isPaid: false, deletedAt: null },
      _sum: { amount: true },
      _count: { _all: true },
    })
    const debt = Math.round((debtAgg._sum.amount ?? 0) * 100) / 100
    if (debt <= 0) return { ok: false, error: t("actions.paymentReminder.noDebt") }

    const oldest = await db.charge.findFirst({
      where: { tenantId, isPaid: false, deletedAt: null, dueDate: { not: null } },
      orderBy: { dueDate: "asc" },
      select: { dueDate: true },
    })

    // Напоминание читает арендатор — язык, деньги и дата берутся из его профиля.
    const { t: tTenant, locale } = await getTForUser(tenant.userId)
    await notifyUser({
      userId: tenant.userId,
      type: "PAYMENT_DUE",
      title: tTenant("actions.paymentReminder.title"),
      message: oldest?.dueDate
        ? tTenant("actions.paymentReminder.messageWithDue", {
            amount: formatMoneyL(locale, debt),
            count: debtAgg._count._all,
            date: formatDateL(locale, oldest.dueDate),
          })
        : tTenant("actions.paymentReminder.message", {
            amount: formatMoneyL(locale, debt),
            count: debtAgg._count._all,
          }),
      link: "/cabinet/finances",
      dedupWindowHours: 20,
    })

    return { ok: true, debt }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t("actions.paymentReminder.sendFailed") }
  }
}
