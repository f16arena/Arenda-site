"use server"

import { assertTenantBuildingAccess } from "@/lib/building-access"
import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { contractScope } from "@/lib/tenant-scope"
import { calculateTenantMonthlyRent } from "@/lib/rent"

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
            fixedMonthlyRent: true, customRate: true, depositAmount: true, rentSchedule: true,
            serviceFeeExempt: true, paymentDueDay: true, penaltyPercent: true, indexationPct: true,
            space: { select: { number: true, area: true, floor: { select: { name: true, ratePerSqm: true } } } },
            tenantSpaces: { select: { space: { select: { number: true, area: true, floor: { select: { name: true, ratePerSqm: true } } } } } },
            fullFloors: { select: { name: true, fixedMonthlyRent: true } },
          },
        },
      },
    })
    if (!c) return { ok: false, error: "Договор не найден" }
    // Сотрудник с частью зданий — только договоры арендаторов своих зданий.
    await assertTenantBuildingAccess(c.tenant.id, orgId)
    const t = c.tenant

    const spaces: string[] = []
    if (t.space) spaces.push(`${t.space.number}${t.space.floor ? ` · ${t.space.floor.name}` : ""}`)
    for (const ts of t.tenantSpaces) if (ts.space) spaces.push(`${ts.space.number}${ts.space.floor ? ` · ${ts.space.floor.name}` : ""}`)
    for (const f of t.fullFloors) spaces.push(`${f.name} (целиком)`)

    // Месячная аренда «как на сейчас»: учитывает фикс-сумму, ставку×площадь,
    // аренду целого этажа и график ступеней (как на карточке арендатора).
    const computedRent = calculateTenantMonthlyRent({
      fixedMonthlyRent: t.fixedMonthlyRent,
      customRate: t.customRate,
      rentSchedule: t.rentSchedule,
      fullFloors: t.fullFloors,
      space: t.space,
      tenantSpaces: t.tenantSpaces,
    })
    const monthly = computedRent > 0 ? computedRent : null

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
      select: {
        id: true,
        number: true,
        status: true,
        signedByLandlordAt: true,
        signedByTenantAt: true,
        tenant: { select: { id: true } },
      },
    })
    if (!c) return { ok: false, error: "Договор не найден" }

    // Подпись ЭЦП — криптографический факт, галочкой её не отменить.
    const ecpSignatures = await db.documentSignature.count({
      where: {
        organizationId: orgId,
        documentType: "CONTRACT",
        OR: [{ documentId: c.id }, ...(c.number ? [{ documentRef: c.number }] : [])],
      },
    })
    if (ecpSignatures > 0 && (!landlord || !tenant)) {
      return { ok: false, error: "Договор подписан ЭЦП — снять отметку вручную нельзя" }
    }

    /**
     * Статус идёт за отметками, а не живёт отдельно. Раньше он «не понижался»:
     * стоило по ошибке отметить подпись обеих сторон и снять её обратно —
     * договор оставался SIGNED и висел в «Активных», хотя подписи уже не было.
     */
    const status = landlord && tenant
      ? "SIGNED"
      : tenant
        ? "SIGNED_BY_TENANT"
        : c.status === "DRAFT"
          ? "DRAFT"
          : "SENT"

    const now = new Date()
    await db.contract.update({
      where: { id: contractId },
      data: {
        signedByLandlordAt: landlord ? c.signedByLandlordAt ?? now : null,
        signedByTenantAt: tenant ? c.signedByTenantAt ?? now : null,
        signedAt: landlord && tenant ? undefined : null,
        status,
      },
    })
    revalidatePath("/admin/documents")
    revalidatePath(`/admin/tenants/${c.tenant.id}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось сохранить статус" }
  }
}
