"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOrgAccess } from "@/lib/org"
import { staffScope, salaryPaymentScope } from "@/lib/tenant-scope"
import { assertStaffInOrg } from "@/lib/scope-guards"

export async function generateSalaryPayments(period: string) {
  const { orgId } = await requireOrgAccess()

  const staff = await db.staff.findMany({
    where: staffScope(orgId),
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
  const { orgId } = await requireOrgAccess()
  const sp = await db.salaryPayment.findFirst({
    where: { id: salaryPaymentId, ...salaryPaymentScope(orgId) },
    select: { id: true },
  })
  if (!sp) throw new Error("Не найдено")

  await db.salaryPayment.update({
    where: { id: salaryPaymentId },
    data: { status: "PAID", paidAt: new Date() },
  })
  revalidatePath("/admin/staff")
  return { success: true }
}

export async function recordSalaryPayment(formData: FormData) {
  const { orgId } = await requireOrgAccess()
  const staffId = formData.get("staffId") as string
  await assertStaffInOrg(staffId, orgId)

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
