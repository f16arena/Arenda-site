"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { getCurrentBuildingId } from "@/lib/current-building"
import { requireOrgAccess } from "@/lib/org"
import { tenantScope, chargeScope, paymentScope } from "@/lib/tenant-scope"
import {
  assertTenantInOrg,
  assertChargeInOrg,
  assertPaymentInOrg,
  assertExpenseInOrg,
  assertBuildingInOrg,
} from "@/lib/scope-guards"

export async function recordPayment(formData: FormData) {
  const { orgId } = await requireOrgAccess()
  const tenantId = formData.get("tenantId") as string
  await assertTenantInOrg(tenantId, orgId)

  const amountStr = formData.get("amount") as string
  const method = formData.get("method") as string
  const note = formData.get("note") as string
  const dateStr = formData.get("paymentDate") as string
  const chargeIds = formData.getAll("chargeIds") as string[]
  // Опционально: на какой счёт пришли деньги (банк/касса/карта).
  // Если указан — автоматически создаём транзакцию и увеличиваем баланс.
  const cashAccountId = (formData.get("cashAccountId") as string)?.trim() || null

  const amount = parseFloat(amountStr)

  // Если указан счёт — проверяем что он принадлежит нашей организации
  if (cashAccountId) {
    const acc = await db.cashAccount.findUnique({
      where: { id: cashAccountId },
      select: { organizationId: true },
    })
    if (!acc || acc.organizationId !== orgId) {
      throw new Error("Указан недействительный счёт")
    }
  }

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { companyName: true },
  })

  // Атомарно: создаём платёж + (опционально) транзакция + обновление баланса +
  // отметка charges как paid.
  const operations: unknown[] = [
    db.payment.create({
      data: {
        tenantId,
        amount,
        method: method || "TRANSFER",
        note: note || null,
        paymentDate: dateStr ? new Date(dateStr) : new Date(),
      },
    }),
  ]

  if (cashAccountId) {
    operations.push(
      db.cashTransaction.create({
        data: {
          accountId: cashAccountId,
          amount,
          type: "DEPOSIT",
          description: `Платёж от ${tenant?.companyName ?? "арендатора"}${note ? ` · ${note}` : ""}`,
        },
      }),
      db.cashAccount.update({
        where: { id: cashAccountId },
        data: { balance: { increment: amount } },
      }),
    )
  }

  if (chargeIds.length > 0) {
    // БЕЗОПАСНОСТЬ: re-валидируем что каждый charge действительно
    // принадлежит этой орге через chargeScope. Иначе теоретически
    // можно подсунуть чужой charge с тем же tenantId.
    const validCharges = await db.charge.findMany({
      where: {
        AND: [
          chargeScope(orgId),
          { id: { in: chargeIds }, tenantId },
        ],
      },
      select: { id: true },
    })
    const validIds = validCharges.map((c) => c.id)

    if (validIds.length !== chargeIds.length) {
      throw new Error("Некоторые начисления недоступны для текущей организации")
    }

    if (validIds.length > 0) {
      operations.push(
        db.charge.updateMany({
          where: { id: { in: validIds } },
          data: { isPaid: true },
        }),
      )
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = await db.$transaction(operations as any)
  const payment = results[0] as { id: string }

  revalidatePath("/admin/finances")
  revalidatePath("/admin/finances/balance")
  revalidatePath(`/admin/tenants/${tenantId}`)
  return { success: true, paymentId: payment.id }
}

export async function generateMonthlyCharges(period: string) {
  const { orgId } = await requireOrgAccess()

  // Только арендаторы текущей организации
  const tenants = await db.tenant.findMany({
    where: tenantScope(orgId),
    include: {
      space: { include: { floor: true } },
      charges: { where: { period, type: "RENT" } },
    },
  })

  let created = 0
  for (const tenant of tenants) {
    if (!tenant.space) continue
    if (tenant.charges.length > 0) continue // already has rent for this period

    const rate = tenant.customRate ?? tenant.space.floor.ratePerSqm
    const rentAmount = tenant.space.area * rate

    await db.charge.create({
      data: {
        tenantId: tenant.id,
        period,
        type: "RENT",
        amount: rentAmount,
        description: `Аренда каб. ${tenant.space.number} за ${period}`,
        dueDate: new Date(parseInt(period.split("-")[0]), parseInt(period.split("-")[1]) - 1, 10),
      },
    })

    if (tenant.needsCleaning && tenant.cleaningFee > 0) {
      await db.charge.create({
        data: {
          tenantId: tenant.id,
          period,
          type: "CLEANING",
          amount: tenant.cleaningFee,
          description: "Уборка помещения",
        },
      })
    }
    created++
  }

  revalidatePath("/admin/finances")
  return { success: true, created }
}

export async function addPenalty(tenantId: string, formData: FormData) {
  const { orgId } = await requireOrgAccess()
  await assertTenantInOrg(tenantId, orgId)

  const amountStr = formData.get("amount") as string
  const description = formData.get("description") as string
  const period = new Date().toISOString().slice(0, 7)

  await db.charge.create({
    data: {
      tenantId,
      period,
      type: "PENALTY",
      amount: parseFloat(amountStr),
      description: description || "Пеня за просрочку",
    },
  })

  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath("/admin/finances")
  return { success: true }
}

export async function addCharge(formData: FormData) {
  const { orgId } = await requireOrgAccess()
  const tenantId = formData.get("tenantId") as string
  await assertTenantInOrg(tenantId, orgId)

  const type = formData.get("type") as string
  const amountStr = formData.get("amount") as string
  const description = formData.get("description") as string
  const period = formData.get("period") as string
  const dueDateStr = formData.get("dueDate") as string

  await db.charge.create({
    data: {
      tenantId,
      period,
      type,
      amount: parseFloat(amountStr),
      description: description || null,
      dueDate: dueDateStr ? new Date(dueDateStr) : null,
    },
  })

  revalidatePath("/admin/finances")
  revalidatePath(`/admin/tenants/${tenantId}`)
  return { success: true }
}

export async function deleteCharge(chargeId: string) {
  const { orgId } = await requireOrgAccess()
  await assertChargeInOrg(chargeId, orgId)

  // findFirst со scope защищает от гонки между assert и delete
  const charge = await db.charge.findFirst({
    where: { id: chargeId, ...chargeScope(orgId) },
    select: { tenantId: true },
  })
  if (!charge) throw new Error("Начисление не найдено или нет доступа")
  await db.charge.delete({ where: { id: chargeId } })
  revalidatePath("/admin/finances")
  if (charge.tenantId) revalidatePath(`/admin/tenants/${charge.tenantId}`)
}

export async function deletePayment(paymentId: string) {
  const { orgId } = await requireOrgAccess()
  await assertPaymentInOrg(paymentId, orgId)

  const payment = await db.payment.findFirst({
    where: { id: paymentId, ...paymentScope(orgId) },
    select: { tenantId: true },
  })
  if (!payment) throw new Error("Платёж не найден или нет доступа")
  await db.payment.delete({ where: { id: paymentId } })
  revalidatePath("/admin/finances")
  if (payment.tenantId) revalidatePath(`/admin/tenants/${payment.tenantId}`)
}

export async function deleteExpense(expenseId: string) {
  const { orgId } = await requireOrgAccess()
  await assertExpenseInOrg(expenseId, orgId)

  await db.expense.delete({ where: { id: expenseId } })
  revalidatePath("/admin/finances")
}

export async function addExpense(formData: FormData) {
  const { orgId } = await requireOrgAccess()
  const buildingId = await getCurrentBuildingId()
  if (!buildingId) return { error: "Здание не выбрано" }
  await assertBuildingInOrg(buildingId, orgId)

  const category = formData.get("category") as string
  const amountStr = formData.get("amount") as string
  const description = formData.get("description") as string
  const period = formData.get("period") as string
  const dateStr = formData.get("date") as string
  // Опционально: с какого счёта списать (банк/касса/карта).
  const cashAccountId = (formData.get("cashAccountId") as string)?.trim() || null

  const amount = parseFloat(amountStr)

  if (cashAccountId) {
    const acc = await db.cashAccount.findUnique({
      where: { id: cashAccountId },
      select: { organizationId: true },
    })
    if (!acc || acc.organizationId !== orgId) {
      return { error: "Указан недействительный счёт" }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const operations: any[] = [
    db.expense.create({
      data: {
        buildingId,
        category,
        amount,
        description: description || null,
        period,
        date: dateStr ? new Date(dateStr) : new Date(),
      },
    }),
  ]

  if (cashAccountId) {
    operations.push(
      db.cashTransaction.create({
        data: {
          accountId: cashAccountId,
          amount: -amount,
          type: "WITHDRAW",
          description: `Расход${description ? ` · ${description}` : ` · ${category}`}`,
        },
      }),
      db.cashAccount.update({
        where: { id: cashAccountId },
        data: { balance: { decrement: amount } },
      }),
    )
  }

  await db.$transaction(operations)

  revalidatePath("/admin/finances")
  revalidatePath("/admin/finances/balance")
  return { success: true }
}
