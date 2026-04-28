"use server"

import { db } from "@/lib/db"
import { auth } from "@/auth"
import { revalidatePath } from "next/cache"

export async function recordPayment(formData: FormData) {
  const tenantId = formData.get("tenantId") as string
  const amountStr = formData.get("amount") as string
  const method = formData.get("method") as string
  const note = formData.get("note") as string
  const dateStr = formData.get("paymentDate") as string
  const chargeIds = formData.getAll("chargeIds") as string[]

  const payment = await db.payment.create({
    data: {
      tenantId,
      amount: parseFloat(amountStr),
      method: method || "TRANSFER",
      note: note || null,
      paymentDate: dateStr ? new Date(dateStr) : new Date(),
    },
  })

  // Mark selected charges as paid
  if (chargeIds.length > 0) {
    await db.charge.updateMany({
      where: { id: { in: chargeIds }, tenantId },
      data: { isPaid: true },
    })
  }

  revalidatePath("/admin/finances")
  revalidatePath(`/admin/tenants/${tenantId}`)
  return { success: true, paymentId: payment.id }
}

export async function generateMonthlyCharges(period: string) {
  const tenants = await db.tenant.findMany({
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
  const tenantId = formData.get("tenantId") as string
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

export async function addExpense(formData: FormData) {
  const building = await db.building.findFirst({ where: { isActive: true } })
  if (!building) return { error: "Здание не найдено" }

  const category = formData.get("category") as string
  const amountStr = formData.get("amount") as string
  const description = formData.get("description") as string
  const period = formData.get("period") as string
  const dateStr = formData.get("date") as string

  await db.expense.create({
    data: {
      buildingId: building.id,
      category,
      amount: parseFloat(amountStr),
      description: description || null,
      period,
      date: dateStr ? new Date(dateStr) : new Date(),
    },
  })

  revalidatePath("/admin/finances")
  return { success: true }
}
