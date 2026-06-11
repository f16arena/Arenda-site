"use server"

import { revalidatePath } from "next/cache"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { contractScope } from "@/lib/tenant-scope"
import { autoCreateDocumentsForSignedContract } from "@/lib/auto-documents"

/**
 * Догенерация счетов и АВР за текущий месяц по ВСЕМ подписанным договорам.
 * Нужна для договоров, подписанных до включения авто-конвейера (он срабатывает
 * только в момент подписания) — месячный cron закроет следующий период сам.
 * Идемпотентно: документ (арендатор × период × тип) не дублируется.
 */
export async function backfillMonthlyDocuments(): Promise<
  { ok: true; created: number; tenants: number } | { ok: false; error: string }
> {
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
    select: { id: true, tenantId: true },
    orderBy: [{ version: "desc" }, { signedAt: "desc" }, { createdAt: "desc" }],
  })
  const latestByTenant = new Map<string, string>()
  for (const c of contracts) {
    if (!latestByTenant.has(c.tenantId)) latestByTenant.set(c.tenantId, c.id)
  }
  if (latestByTenant.size === 0) return { ok: false, error: "Подписанных договоров нет" }

  const countDocs = () => db.generatedDocument.count({
    where: { organizationId: orgId, documentType: { in: ["INVOICE", "ACT"] }, period, deletedAt: null },
  })
  const before = await countDocs()

  // Последовательно: nextDocumentNumber инкрементирует счётчик — параллельность даст дубли номеров
  for (const contractId of latestByTenant.values()) {
    await autoCreateDocumentsForSignedContract(contractId)
  }

  const after = await countDocs()
  revalidatePath("/admin/documents")
  return { ok: true, created: after - before, tenants: latestByTenant.size }
}
