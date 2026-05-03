"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"
import { requireOrgAccess, checkLimit, requireSubscriptionActive } from "@/lib/org"
import { assertStaffInOrg, assertUserInOrg } from "@/lib/scope-guards"
import { normalizeEmail, normalizeKzPhone } from "@/lib/contact-validation"
import { replaceUserBuildingAccess } from "@/lib/building-access"

function parseBuildingIds(formData: FormData) {
  return formData.getAll("buildingIds").map((value) => String(value)).filter(Boolean)
}

function requireBuildingIds(buildingIds: string[]) {
  if (buildingIds.length === 0) throw new Error("Назначьте сотруднику хотя бы одно здание")
}

export async function createStaff(formData: FormData) {
  const { orgId } = await requireOrgAccess()
  await requireSubscriptionActive(orgId)
  await checkLimit(orgId, "users")

  const name = formData.get("name") as string
  const phone = normalizeKzPhone(formData.get("phone"))
  const email = normalizeEmail(formData.get("email"))
  const role = formData.get("role") as string
  const position = formData.get("position") as string
  const salaryStr = formData.get("salary") as string
  const password = formData.get("password") as string
  const buildingIds = parseBuildingIds(formData)
  requireBuildingIds(buildingIds)

  const hash = await bcrypt.hash(password || "change123", 10)

  const user = await db.user.create({
    data: {
      name,
      phone,
      email,
      password: hash,
      role,
      organizationId: orgId,
    },
  })

  await db.staff.create({
    data: {
      userId: user.id,
      position,
      salary: salaryStr ? parseFloat(salaryStr) : 0,
    },
  })
  await replaceUserBuildingAccess(user.id, buildingIds, orgId)

  revalidatePath("/admin/staff")
  revalidatePath("/admin/users")
  return { success: true }
}

export async function updateStaff(staffId: string, userId: string, formData: FormData) {
  const { orgId } = await requireOrgAccess()
  await assertStaffInOrg(staffId, orgId)
  await assertUserInOrg(userId, orgId)

  const name = formData.get("name") as string
  const phone = normalizeKzPhone(formData.get("phone"))
  const email = normalizeEmail(formData.get("email"))
  const role = formData.get("role") as string
  const position = formData.get("position") as string
  const salaryStr = formData.get("salary") as string
  const newPassword = formData.get("newPassword") as string
  const buildingIds = parseBuildingIds(formData)
  requireBuildingIds(buildingIds)

  await db.user.update({
    where: { id: userId },
    data: {
      name,
      phone,
      email,
      role,
      ...(newPassword ? { password: await bcrypt.hash(newPassword, 10) } : {}),
    },
  })

  await db.staff.update({
    where: { id: staffId },
    data: {
      position,
      salary: salaryStr ? parseFloat(salaryStr) : 0,
    },
  })
  await replaceUserBuildingAccess(userId, buildingIds, orgId)

  revalidatePath("/admin/staff")
  revalidatePath("/admin/users")
  return { success: true }
}

export async function deactivateStaff(userId: string) {
  const { orgId } = await requireOrgAccess()
  await assertUserInOrg(userId, orgId)

  await db.user.update({
    where: { id: userId },
    data: { isActive: false },
  })

  revalidatePath("/admin/staff")
  return { success: true }
}

export async function reactivateStaff(userId: string) {
  const { orgId } = await requireOrgAccess()
  await assertUserInOrg(userId, orgId)

  await db.user.update({
    where: { id: userId },
    data: { isActive: true },
  })

  revalidatePath("/admin/staff")
  return { success: true }
}

export async function deleteStaff(staffId: string, userId: string) {
  const { orgId } = await requireOrgAccess()
  await assertStaffInOrg(staffId, orgId)
  await assertUserInOrg(userId, orgId)

  await db.staff.delete({ where: { id: staffId } })
  await db.user.update({ where: { id: userId }, data: { isActive: false } })

  revalidatePath("/admin/staff")
}
