"use server"

import { revalidatePath } from "next/cache"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { contractScope } from "@/lib/tenant-scope"
import { createActForTenant, createInvoiceForTenant } from "@/lib/auto-documents"

/**
 * Догенерация счетов и АВР за текущий месяц по ВСЕМ подписанным договорам.
 * Нужна для договоров, подписанных до включения авто-конвейера (он срабатывает
 * только в момент подписания) — месячный cron закроет следующий период сам.
 * Идемпотентно: документ (арендатор × период × тип) не дублируется.
 */
export async function backfillMonthlyDocuments(): Promise<
  { ok: true; created: number; tenants: number } | { ok: false; error: string }
> {
  try {
    await requireCapabilityAndFeature("documents.generateBulk")
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Нет доступа" }
  }
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") return { ok: false, error: "Не авторизован" }
  if (session.user.role !== "OWNER" && session.user.role !== "ADMIN" && !session.user.isPlatformOwner) {
    return { ok: false, error: "Доступно владельцу и администратору" }
  }
  const { orgId } = await requireOrgAccess()
  if (!orgId) return { ok: false, error: "Организация не определена" }

  const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`

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
  if (latestByTenant.size === 0) return { ok: false, error: "Подписанных договоров нет" }

  // Ручной режим: владелец явно попросил — создаём И счёт, И АВР за период
  // (авто-конвейер сам по себе делает счёт при подписании, АВР — в конце месяца).
  // Последовательно: nextDocumentNumber инкрементирует счётчик — параллельность даст дубли номеров.
  let created = 0
  for (const [tenantId, companyName] of latestByTenant) {
    if (await createInvoiceForTenant(orgId, tenantId, companyName, period)) created++
    if (await createActForTenant(orgId, tenantId, companyName, period)) created++
  }

  revalidatePath("/admin/documents")
  return { ok: true, created, tenants: latestByTenant.size }
}
