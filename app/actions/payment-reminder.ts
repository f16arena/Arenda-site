"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { assertTenantInOrg } from "@/lib/scope-guards"
import { notifyUser } from "@/lib/notify"
import { formatMoney } from "@/lib/utils"

/**
 * Точечное напоминание об оплате конкретному арендатору: in-app + email
 * со сводкой долга и ссылкой на кабинет (реквизиты и QR — там).
 * Дедуп 20 часов — повторный клик в тот же день не спамит.
 */
export async function remindTenantPayment(
  tenantId: string,
): Promise<{ ok: true; debt: number } | { ok: false; error: string }> {
  try {
    const session = await auth()
    if (!session?.user || session.user.role === "TENANT") return { ok: false, error: "Не авторизован" }
    const { orgId } = await requireOrgAccess()
    await assertTenantInOrg(tenantId, orgId)

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { companyName: true, userId: true },
    })
    if (!tenant?.userId) return { ok: false, error: "У арендатора нет пользователя — некому отправить" }

    const debtAgg = await db.charge.aggregate({
      where: { tenantId, isPaid: false, deletedAt: null },
      _sum: { amount: true },
      _count: { _all: true },
    })
    const debt = Math.round((debtAgg._sum.amount ?? 0) * 100) / 100
    if (debt <= 0) return { ok: false, error: "Долга нет — напоминать не о чем" }

    const oldest = await db.charge.findFirst({
      where: { tenantId, isPaid: false, deletedAt: null, dueDate: { not: null } },
      orderBy: { dueDate: "asc" },
      select: { dueDate: true },
    })

    await notifyUser({
      userId: tenant.userId,
      type: "PAYMENT_DUE",
      title: "Напоминание об оплате аренды",
      message: `За вами числится задолженность ${formatMoney(debt)} (${debtAgg._count._all} начислений)${oldest?.dueDate ? `, ближайший срок оплаты — ${new Date(oldest.dueDate).toLocaleDateString("ru-RU")}` : ""}. Реквизиты и QR для оплаты — в кабинете, раздел «Финансы».`,
      link: "/cabinet/finances",
      dedupWindowHours: 20,
    })

    return { ok: true, debt }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось отправить напоминание" }
  }
}
