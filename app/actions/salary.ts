"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function generateSalaryPayments(period: string) {
  const staff = await db.staff.findMany({
    include: {
      user: { select: { isActive: true } },
      salaryPayments: { where: { period } },
    },
  })

  let created = 0
  for (const s of staff) {
    if (!s.user.isActive) continue
    if (s.salaryPayments.length > 0) continue
    await db.salaryPayment.create({
      data: { staffId: s.id, amount: s.salary, period, status: "PENDING" },
    })
    created++
  }

  revalidatePath("/admin/staff")
  return { success: true, created }
}

export async function markSalaryPaid(salaryPaymentId: string) {
  await db.salaryPayment.update({
    where: { id: salaryPaymentId },
    data: { status: "PAID", paidAt: new Date() },
  })
  revalidatePath("/admin/staff")
  return { success: true }
}

export async function recordSalaryPayment(formData: FormData) {
  const staffId = formData.get("staffId") as string
  const amountStr = formData.get("amount") as string
  const period = formData.get("period") as string

  await db.salaryPayment.create({
    data: {
      staffId,
      amount: parseFloat(amountStr),
      period,
      status: "PAID",
      paidAt: new Date(),
    },
  })

  revalidatePath("/admin/staff")
  return { success: true }
}
