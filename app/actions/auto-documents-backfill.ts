"use server"

import { revalidatePath } from "next/cache"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { contractScope } from "@/lib/tenant-scope"
import { createActForTenant, createInvoiceForTenant } from "@/lib/auto-documents"
import { getT } from "@/lib/i18n/server"

/**
 * Догенерация счетов и АВР за текущий месяц по ВСЕМ подписанным договорам.
 * Нужна для договоров, подписанных до включения авто-конвейера (он срабатывает
 * только в момент подписания) — месячный cron закроет следующий период сам.
 * Идемпотентно: документ (арендатор × период × тип) не дублируется.
 */
export async function backfillMonthlyDocuments(periodInput?: string): Promise<
  { ok: true; created: number; tenants: number; period: string } | { ok: false; error: string }
> {
  const { t } = await getT()
  try {
    await requireCapabilityAndFeature("documents.generateBulk")
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t("actions.common.accessDenied") }
  }
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") return { ok: false, error: t("actions.common.noAccess") }
  if (session.user.role !== "OWNER" && session.user.role !== "ADMIN" && !session.user.isPlatformOwner) {
    return { ok: false, error: t("actions.common.ownerAndAdminOnly") }
  }
  const { orgId } = await requireOrgAccess()
  if (!orgId) return { ok: false, error: t("actions.common.organizationUndefined") }

  // Период можно выбрать (напр. закрыть и июнь, и июль). По умолчанию — текущий месяц.
  const currentPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  const period = periodInput && /^\d{4}-\d{2}$/.test(periodInput) ? periodInput : currentPeriod

  // Последний подписанный договор каждого арендатора (не ДС)
  const contracts = await db.contract.findMany({
    where: { AND: [contractScope(orgId), { status: "SIGNED", type: { not: "ADDENDUM" } }] },
    select: { tenantId: true, tenant: { select: { companyName: true } } },
    orderBy: [{ version: "desc" }, { signedAt: "desc" }, { createdAt: "desc" }],
  })
  const latestByTenant = new Map<string, string>()
  for (const c of contracts) {
    if (!latestByTenant.has(c.tenantId)) latestByTenant.set(c.tenantId, c.tenant.companyName)
  }
  if (latestByTenant.size === 0) return { ok: false, error: t("actions.autoDocuments.noSignedContracts") }

  // Ручной режим: владелец явно попросил — создаём И счёт, И АВР за период
  // (авто-конвейер сам по себе делает счёт при подписании, АВР — в конце месяца).
  // Последовательно: nextDocumentNumber инкрементирует счётчик — параллельность даст дубли номеров.
  let created = 0
  for (const [tenantId, companyName] of latestByTenant) {
    if (await createInvoiceForTenant(orgId, tenantId, companyName, period)) created++
    if (await createActForTenant(orgId, tenantId, companyName, period)) created++
  }

  revalidatePath("/admin/documents")
  return { ok: true, created, tenants: latestByTenant.size, period }
}
