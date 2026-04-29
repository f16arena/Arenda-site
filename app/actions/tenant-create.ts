"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"
import { requireOrgAccess, checkLimit, requireSubscriptionActive } from "@/lib/org"
import { assertSpaceInOrg } from "@/lib/scope-guards"

export async function createTenant(formData: FormData) {
  const { orgId } = await requireOrgAccess()
  await requireSubscriptionActive(orgId)
  await checkLimit(orgId, "tenants")

  const name = String(formData.get("name") ?? "").trim()
  const phone = String(formData.get("phone") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const companyName = String(formData.get("companyName") ?? "").trim()
  const legalType = String(formData.get("legalType") ?? "IP")
  const bin = String(formData.get("bin") ?? "").trim()
  const category = String(formData.get("category") ?? "").trim()
  const spaceId = String(formData.get("spaceId") ?? "").trim()
  const contractStart = String(formData.get("contractStart") ?? "")
  const contractEnd = String(formData.get("contractEnd") ?? "")

  if (!name) throw new Error("Введите ФИО контактного лица")
  if (!companyName) throw new Error("Введите название компании")

  // Если задан spaceId — он должен принадлежать текущей организации
  if (spaceId) {
    await assertSpaceInOrg(spaceId, orgId)
  }

  if (phone) {
    const existing = await db.user.findUnique({ where: { phone }, select: { id: true } })
    if (existing) throw new Error(`Телефон ${phone} уже используется другим пользователем`)
  }

  const hash = await bcrypt.hash(password || "tenant123", 10)

  let userId: string
  try {
    const user = await db.user.create({
      data: {
        name,
        phone: phone || null,
        password: hash,
        role: "TENANT",
        organizationId: orgId,
      },
      select: { id: true },
    })
    userId = user.id
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown"
    if (msg.includes("does not exist") || msg.includes("column")) {
      throw new Error("Не применены миграции БД. Запустите prisma db push.")
    }
    throw new Error(`Не удалось создать пользователя: ${msg}`)
  }

  let tenantId: string
  try {
    const tenant = await db.tenant.create({
      data: {
        userId,
        spaceId: spaceId || null,
        companyName,
        legalType,
        bin: bin || null,
        category: category || null,
        contractStart: contractStart ? new Date(contractStart) : null,
        contractEnd: contractEnd ? new Date(contractEnd) : null,
      },
      select: { id: true },
    })
    tenantId = tenant.id
  } catch (e) {
    await db.user.delete({ where: { id: userId } }).catch(() => {})
    const msg = e instanceof Error ? e.message : "unknown"
    if (msg.includes("does not exist") || msg.includes("column")) {
      throw new Error("Не применены миграции БД. Запустите prisma db push.")
    }
    throw new Error(`Не удалось создать арендатора: ${msg}`)
  }

  if (spaceId) {
    await db.space.update({
      where: { id: spaceId },
      data: { status: "OCCUPIED" },
    })
  }

  revalidatePath("/admin/tenants")
  revalidatePath("/admin/spaces")
  return { success: true, tenantId }
}
