"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"

export async function createTenant(formData: FormData) {
  const name = formData.get("name") as string
  const phone = formData.get("phone") as string
  const password = formData.get("password") as string
  const companyName = formData.get("companyName") as string
  const legalType = formData.get("legalType") as string
  const bin = formData.get("bin") as string
  const category = formData.get("category") as string
  const spaceId = formData.get("spaceId") as string
  const contractStart = formData.get("contractStart") as string
  const contractEnd = formData.get("contractEnd") as string

  const hash = await bcrypt.hash(password || "tenant123", 10)

  const user = await db.user.create({
    data: {
      name,
      phone: phone || null,
      password: hash,
      role: "TENANT",
    },
  })

  const tenant = await db.tenant.create({
    data: {
      userId: user.id,
      spaceId: spaceId || null,
      companyName,
      legalType,
      bin: bin || null,
      category: category || null,
      contractStart: contractStart ? new Date(contractStart) : null,
      contractEnd: contractEnd ? new Date(contractEnd) : null,
    },
  })

  if (spaceId) {
    await db.space.update({
      where: { id: spaceId },
      data: { status: "OCCUPIED" },
    })
  }

  revalidatePath("/admin/tenants")
  revalidatePath("/admin/spaces")
  return { success: true, tenantId: tenant.id }
}
