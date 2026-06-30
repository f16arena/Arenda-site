"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { contractScope } from "@/lib/tenant-scope"

export interface ContractCardData {
  id: string
  number: string | null
  type: string
  isExternal: boolean
  status: string
  tenantName: string
  tenantId: string
  startDate: string | null
  endDate: string | null
  signedAt: string | null
  signedByLandlord: boolean
  signedByTenant: boolean
  monthlyRent: number | null
  rentMode: "FIXED" | "RATE" | null
  customRate: number | null
  deposit: number | null
  serviceFeeExempt: boolean
  paymentDueDay: number | null
  penaltyPercent: number | null
  indexationPct: number | null
  spaces: string[]
  attachmentFileId: string | null
  /** Может ли текущий пользователь менять статус подписи (владелец/админ). */
  canManage: boolean
}

const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

function isOwnerLikeSession(session: { user?: { role: string; isPlatformOwner?: boolean } } | null): boolean {
  return !!session?.user && (["OWNER", "ADMIN"].includes(session.user.role) || !!session.user.isPlatformOwner)
}

/** Карточка договора: ключевые условия + статус подписи (для модалки в списке документов). */
export async function getContractCard(
  contractId: string,
): Promise<{ ok: true; data: ContractCardData } | { ok: false; error: string }> {
  try {
    const session = await auth()
    const { orgId } = await requireOrgAccess()
    const c = await db.contract.findFirst({
      where: { AND: [contractScope(orgId), { id: contractId }] },
      select: {
        id: true, number: true, type: true, status: true,
        startDate: true, endDate: true, signedAt: true,
        signedByLandlordAt: true, signedByTenantAt: true, attachmentFileId: true,
        tenant: {
          select: {
            id: true, companyName: true,
            fixedMonthlyRent: true, customRate: true, depositAmount: true,
            serviceFeeExempt: true, paymentDueDay: true, penaltyPercent: true, indexationPct: true,
            space: { select: { number: true, floor: { select: { name: true } } } },
            tenantSpaces: { select: { space: { select: { number: true, floor: { select: { name: true } } } } } },
            fullFloors: { select: { name: true } },
          },
        },
      },
    })
    if (!c) return { ok: false, error: "Договор не найден" }
    const t = c.tenant

    const spaces: string[] = []
    if (t.space) spaces.push(`${t.space.number}${t.space.floor ? ` · ${t.space.floor.name}` : ""}`)
    for (const ts of t.tenantSpaces) if (ts.space) spaces.push(`${ts.space.number}${ts.space.floor ? ` · ${ts.space.floor.name}` : ""}`)
    for (const f of t.fullFloors) spaces.push(`${f.name} (целиком)`)

    const monthly = typeof t.fixedMonthlyRent === "number" && t.fixedMonthlyRent > 0 ? t.fixedMonthlyRent : null

    return {
      ok: true,
      data: {
        id: c.id,
        number: c.number,
        type: c.type,
        isExternal: c.type === "EXTERNAL",
        status: c.status,
        tenantName: t.companyName,
        tenantId: t.id,
        startDate: fmtDate(c.startDate),
        endDate: fmtDate(c.endDate),
        signedAt: fmtDate(c.signedAt),
        signedByLandlord: !!c.signedByLandlordAt,
        signedByTenant: !!c.signedByTenantAt,
        monthlyRent: monthly,
        rentMode: monthly ? "FIXED" : t.customRate ? "RATE" : null,
        customRate: t.customRate,
        deposit: t.depositAmount,
        serviceFeeExempt: t.serviceFeeExempt,
        paymentDueDay: t.paymentDueDay,
        penaltyPercent: t.penaltyPercent,
        indexationPct: t.indexationPct,
        spaces,
        attachmentFileId: c.attachmentFileId,
        canManage: isOwnerLikeSession(session),
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось загрузить карточку" }
  }
}

/**
 * Ручная установка статуса подписи договора (для офлайн/внешних договоров,
 * подписанных на бумаге/PDF). Доступно владельцу/администратору. Ставит/снимает
 * отметку подписи стороны; при обеих сторонах статус → SIGNED.
 */
export async function setContractSignatureManual(
  contractId: string,
  landlord: boolean,
  tenant: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await auth()
    const { orgId } = await requireOrgAccess()
    if (!isOwnerLikeSession(session)) return { ok: false, error: "Доступно владельцу и администратору" }

    const c = await db.contract.findFirst({
      where: { AND: [contractScope(orgId), { id: contractId }] },
      select: { id: true, signedByLandlordAt: true, signedByTenantAt: true, tenant: { select: { id: true } } },
    })
    if (!c) return { ok: false, error: "Договор не найден" }

    const now = new Date()
    await db.contract.update({
      where: { id: contractId },
      data: {
        signedByLandlordAt: landlord ? c.signedByLandlordAt ?? now : null,
        signedByTenantAt: tenant ? c.signedByTenantAt ?? now : null,
        // Обе стороны → договор полностью подписан. Иначе статус не понижаем.
        ...(landlord && tenant ? { status: "SIGNED" } : {}),
      },
    })
    revalidatePath("/admin/documents")
    revalidatePath(`/admin/tenants/${c.tenant.id}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось сохранить статус" }
  }
}
