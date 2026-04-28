"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export async function updateTenant(tenantId: string, formData: FormData) {
  const companyName = formData.get("companyName") as string
  const bin = formData.get("bin") as string
  const bankName = formData.get("bankName") as string
  const iik = formData.get("iik") as string
  const bik = formData.get("bik") as string
  const legalType = formData.get("legalType") as string
  const category = formData.get("category") as string
  const customRateStr = formData.get("customRate") as string
  const cleaningFeeStr = formData.get("cleaningFee") as string
  const needsCleaning = formData.get("needsCleaning") === "on"
  const contractStart = formData.get("contractStart") as string
  const contractEnd = formData.get("contractEnd") as string

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      companyName,
      bin: bin || null,
      bankName: bankName || null,
      iik: iik || null,
      bik: bik || null,
      legalType,
      category: category || null,
      customRate: customRateStr ? parseFloat(customRateStr) : null,
      cleaningFee: cleaningFeeStr ? parseFloat(cleaningFeeStr) : 0,
      needsCleaning,
      contractStart: contractStart ? new Date(contractStart) : null,
      contractEnd: contractEnd ? new Date(contractEnd) : null,
    },
  })

  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath("/admin/tenants")
  return { success: true }
}

export async function updateTenantRequisites(tenantId: string, formData: FormData) {
  const bankName = formData.get("bankName") as string
  const iik = formData.get("iik") as string
  const bik = formData.get("bik") as string
  const bin = formData.get("bin") as string

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      bankName: bankName || null,
      iik: iik || null,
      bik: bik || null,
      bin: bin || null,
    },
  })

  revalidatePath(`/admin/tenants/${tenantId}`)
  return { success: true }
}

export async function updateTenantRentalTerms(tenantId: string, formData: FormData) {
  const customRateStr = formData.get("customRate") as string
  const cleaningFeeStr = formData.get("cleaningFee") as string
  const needsCleaning = formData.get("needsCleaning") === "on"

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      customRate: customRateStr ? parseFloat(customRateStr) : null,
      cleaningFee: cleaningFeeStr ? parseFloat(cleaningFeeStr) : 0,
      needsCleaning,
    },
  })

  revalidatePath(`/admin/tenants/${tenantId}`)
  return { success: true }
}

export async function updateTenantUser(userId: string, tenantId: string, formData: FormData) {
  const name = formData.get("name") as string
  const phone = formData.get("phone") as string
  const email = formData.get("email") as string

  await db.user.update({
    where: { id: userId },
    data: {
      name,
      phone: phone || null,
      email: email || null,
    },
  })

  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath("/admin/tenants")
  return { success: true }
}

export async function deleteTenant(tenantId: string, options?: { redirectAfter?: boolean }) {
  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, userId: true, spaceId: true, companyName: true },
  })
  if (!tenant) throw new Error("Арендатор не найден")

  if (tenant.spaceId) {
    await db.space.update({
      where: { id: tenant.spaceId },
      data: { status: "VACANT" },
    })
  }

  // Каскад в БД удалит charges, payments, contracts, documents, requests
  await db.tenant.delete({ where: { id: tenantId } })

  // Деактивируем пользователя (не удаляем — сохраняем историю в комментариях/задачах)
  await db.user.update({
    where: { id: tenant.userId },
    data: { isActive: false },
  })

  revalidatePath("/admin/tenants")
  revalidatePath("/admin/spaces")

  if (options?.redirectAfter) redirect("/admin/tenants")
}

export async function assignTenantSpace(tenantId: string, spaceId: string | null) {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } })

  if (tenant?.spaceId) {
    await db.space.update({
      where: { id: tenant.spaceId },
      data: { status: "VACANT" },
    })
  }

  if (spaceId) {
    await db.space.update({
      where: { id: spaceId },
      data: { status: "OCCUPIED" },
    })
  }

  await db.tenant.update({
    where: { id: tenantId },
    data: { spaceId: spaceId || null },
  })

  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath("/admin/tenants")
  revalidatePath("/admin/spaces")
  return { success: true }
}
