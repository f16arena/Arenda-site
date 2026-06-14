"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { assertTenantInOrg } from "@/lib/scope-guards"
import { tenantScope } from "@/lib/tenant-scope"
import { applyTenantCreditToCharges } from "@/lib/tenant-credit"
import { buildInstallmentSchedule, MIN_INSTALLMENTS, MAX_INSTALLMENTS } from "@/lib/installments"

function revalidate() {
  revalidatePath("/admin/finances/installments")
  revalidatePath("/admin/analytics")
  revalidatePath("/admin/finances")
}

// Неоплаченные начисления арендатора, доступные для реструктуризации (не в плане,
// без депозита). Для диалога создания рассрочки.
export async function getTenantUnpaidChargesForPlan(tenantId: string) {
  await requireCapabilityAndFeature("finance.createInvoice")
  const { orgId } = await requireOrgAccess()
  await assertTenantInOrg(tenantId, orgId)
  return db.charge.findMany({
    where: {
      tenantId,
      isPaid: false,
      deletedAt: null,
      installmentPlanId: null,
      type: { notIn: ["DEPOSIT", "DEPOSIT_REFUND"] },
    },
    select: { id: true, type: true, amount: true, period: true, description: true, dueDate: true },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    take: 100,
  })
}

export async function createInstallmentPlan(input: {
  tenantId: string
  chargeIds: string[]
  count: number
  firstDue: string
  note?: string
}) {
  await requireCapabilityAndFeature("finance.createInvoice")
  const { orgId } = await requireOrgAccess()
  await assertTenantInOrg(input.tenantId, orgId)

  const chargeIds = [...new Set(input.chargeIds)].filter(Boolean)
  if (chargeIds.length === 0) return { error: "Выберите начисления для рассрочки" }

  const count = Math.trunc(Number(input.count))
  if (!(count >= MIN_INSTALLMENTS && count <= MAX_INSTALLMENTS)) {
    return { error: `Число платежей: от ${MIN_INSTALLMENTS} до ${MAX_INSTALLMENTS}` }
  }
  const firstDue = new Date(input.firstDue)
  if (Number.isNaN(firstDue.getTime())) return { error: "Некорректная дата первого платежа" }

  // Только неоплаченные начисления этого арендатора, ещё не в плане.
  const charges = await db.charge.findMany({
    where: { id: { in: chargeIds }, tenantId: input.tenantId, isPaid: false, deletedAt: null, installmentPlanId: null },
    select: { id: true, amount: true },
  })
  if (charges.length === 0) return { error: "Подходящих начислений не найдено" }
  const total = Math.round(charges.reduce((s, c) => s + c.amount, 0) * 100) / 100
  if (total <= 0) return { error: "Сумма долга должна быть положительной" }

  const schedule = buildInstallmentSchedule(total, count, firstDue)

  await db.$transaction(async (tx) => {
    const plan = await tx.debtInstallmentPlan.create({
      data: { tenantId: input.tenantId, totalAmount: total, note: input.note?.trim() || null, status: "ACTIVE" },
    })
    await tx.charge.updateMany({
      where: { id: { in: charges.map((c) => c.id) } },
      data: { installmentPlanId: plan.id },
    })
    await tx.debtInstallment.createMany({
      data: schedule.map((s) => ({ planId: plan.id, seq: s.seq, dueDate: new Date(s.dueDateISO), amount: s.amount })),
    })
  })

  revalidate()
  return { success: true }
}

// Отметить взнос оплаченным: создаёт Payment и через аудированный механизм
// аванса (applyTenantCreditToCharges) FIFO гасит покрытые начисления. Когда все
// взносы оплачены — план переходит в COMPLETED.
export async function markInstallmentPaid(installmentId: string, method = "TRANSFER") {
  await requireCapabilityAndFeature("finance.recordPayment")
  const { orgId } = await requireOrgAccess()

  const inst = await db.debtInstallment.findFirst({
    where: { id: installmentId, plan: { tenant: tenantScope(orgId) } },
    select: { id: true, seq: true, amount: true, isPaid: true, planId: true, plan: { select: { tenantId: true } } },
  })
  if (!inst) return { error: "Платёж не найден" }
  if (inst.isPaid) return { error: "Платёж уже отмечен оплаченным" }

  const tenantId = inst.plan.tenantId
  const payment = await db.payment.create({
    data: {
      tenantId,
      amount: inst.amount,
      paymentDate: new Date(),
      method,
      note: `Платёж по рассрочке №${inst.seq}`,
      unappliedAmount: inst.amount,
    },
    select: { id: true },
  })
  await db.debtInstallment.update({
    where: { id: inst.id },
    data: { isPaid: true, paidAt: new Date(), paymentId: payment.id },
  })
  // FIFO-зачёт аванса в неоплаченные начисления (включая покрытые планом).
  await applyTenantCreditToCharges(tenantId)

  const remaining = await db.debtInstallment.count({ where: { planId: inst.planId, isPaid: false } })
  if (remaining === 0) {
    await db.debtInstallmentPlan.update({ where: { id: inst.planId }, data: { status: "COMPLETED" } })
  }

  revalidate()
  return { success: true }
}

// Отменить план: вернуть начисления под обычный режим (пеня снова капает).
export async function cancelInstallmentPlan(planId: string) {
  await requireCapabilityAndFeature("finance.createInvoice")
  const { orgId } = await requireOrgAccess()

  const plan = await db.debtInstallmentPlan.findFirst({
    where: { id: planId, tenant: tenantScope(orgId) },
    select: { id: true },
  })
  if (!plan) return { error: "План не найден" }

  await db.$transaction([
    db.charge.updateMany({ where: { installmentPlanId: planId }, data: { installmentPlanId: null } }),
    db.debtInstallmentPlan.update({ where: { id: planId }, data: { status: "CANCELLED" } }),
  ])

  revalidate()
  return { success: true }
}
