"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { chargeScope, tenantScope } from "@/lib/tenant-scope"
import { assertTenantInOrg } from "@/lib/scope-guards"
import { calculateTenantMonthlyRent } from "@/lib/rent"

function currentPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function revalidateDepositPages(tenantId?: string) {
  revalidatePath("/admin/finances/deposits")
  revalidatePath("/admin/finances")
  if (tenantId) revalidatePath(`/admin/tenants/${tenantId}`)
}

/**
 * Выставить начисление «Гарантийный депозит» арендатору вручную (для арендаторов,
 * чьи договоры подписаны до появления автоматики). Сумма: Tenant.depositAmount,
 * дефолт — 1 месячная аренда. Отказывает, если живое DEPOSIT-начисление уже есть.
 */
export async function issueDepositCharge(
  tenantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireCapabilityAndFeature("finance.createInvoice")
    const { orgId } = await requireOrgAccess()
    await assertTenantInOrg(tenantId, orgId)

    const existing = await db.charge.findFirst({
      where: { tenantId, type: "DEPOSIT", deletedAt: null },
      select: { id: true },
    })
    if (existing) return { ok: false, error: "Начисление депозита уже существует" }

    const tenant = await db.tenant.findFirst({
      where: { AND: [tenantScope(orgId), { id: tenantId }] },
      select: {
        depositAmount: true,
        customRate: true,
        fixedMonthlyRent: true,
        space: { select: { area: true, floor: { select: { ratePerSqm: true } } } },
        tenantSpaces: { select: { space: { select: { area: true, floor: { select: { ratePerSqm: true } } } } } },
        fullFloors: { select: { fixedMonthlyRent: true } },
        contracts: {
          where: { status: "SIGNED", deletedAt: null, type: { not: "ADDENDUM" } },
          orderBy: [{ version: "desc" }, { signedAt: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: { id: true, number: true },
        },
      },
    })
    if (!tenant) return { ok: false, error: "Арендатор не найден" }
    if (tenant.depositAmount === 0) return { ok: false, error: "У арендатора депозит отключён (сумма 0)" }

    const amount = tenant.depositAmount ?? calculateTenantMonthlyRent(tenant)
    if (!amount || amount <= 0) {
      return { ok: false, error: "Не удалось определить сумму депозита: укажите её в условиях аренды" }
    }

    const contract = tenant.contracts[0] ?? null
    await db.charge.create({
      data: {
        tenantId,
        contractId: contract?.id ?? null,
        period: currentPeriod(),
        type: "DEPOSIT",
        amount: Math.round(amount * 100) / 100,
        description: `Гарантийный депозит${contract?.number ? ` по договору № ${contract.number}` : ""}`,
        dueDate: new Date(),
      },
    })
    revalidateDepositPages(tenantId)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось выставить начисление" }
  }
}

/** Отметить депозитное начисление оплаченным (деньги получены вне платёжного модуля). */
export async function markDepositPaid(
  chargeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireCapabilityAndFeature("finance.recordPayment")
    const { orgId } = await requireOrgAccess()
    const result = await db.charge.updateMany({
      where: { AND: [chargeScope(orgId), { id: chargeId, type: "DEPOSIT", isPaid: false }] },
      data: { isPaid: true },
    })
    if (result.count === 0) return { ok: false, error: "Начисление не найдено или уже оплачено" }
    revalidateDepositPages()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось отметить" }
  }
}

/**
 * Возврат депозита при выезде: отдельная запись типа DEPOSIT_REFUND (положительная
 * сумма, isPaid=true). Удерживаемая сумма = оплаченные DEPOSIT − DEPOSIT_REFUND;
 * история сохраняется, выгрузки не видят «минусовых» строк.
 */
export async function returnDeposit(
  tenantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireCapabilityAndFeature("finance.recordPayment")
    const { orgId } = await requireOrgAccess()
    await assertTenantInOrg(tenantId, orgId)

    const [paid, refunded] = await Promise.all([
      db.charge.aggregate({
        where: { tenantId, type: "DEPOSIT", isPaid: true, deletedAt: null },
        _sum: { amount: true },
      }),
      db.charge.aggregate({
        where: { tenantId, type: "DEPOSIT_REFUND", deletedAt: null },
        _sum: { amount: true },
      }),
    ])
    const held = Math.round(((paid._sum.amount ?? 0) - (refunded._sum.amount ?? 0)) * 100) / 100
    if (held <= 0) return { ok: false, error: "Удерживаемого депозита нет — возвращать нечего" }

    await db.charge.create({
      data: {
        tenantId,
        period: currentPeriod(),
        type: "DEPOSIT_REFUND",
        amount: held,
        description: "Возврат гарантийного депозита",
        isPaid: true,
        dueDate: new Date(),
      },
    })
    revalidateDepositPages(tenantId)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось оформить возврат" }
  }
}
