"use server"

import { db } from "@/lib/db"
import { revalidatePath, revalidateTag } from "next/cache"
import { requireOwner } from "@/lib/permissions"
import bcrypt from "bcryptjs"
import { requireOrgAccess, checkLimit, requireSubscriptionActive } from "@/lib/org"
import { assertUserInOrg } from "@/lib/scope-guards"
import { normalizeEmail, normalizeKzPhone } from "@/lib/contact-validation"
import { replaceUserBuildingAccess } from "@/lib/building-access"
import { ADMIN_SHELL_CACHE_TAG } from "@/lib/admin-shell-cache"

const BUILDING_SCOPED_ROLES = new Set(["ADMIN", "ACCOUNTANT", "FACILITY_MANAGER", "EMPLOYEE"])

function parseBuildingIds(formData: FormData) {
  return formData.getAll("buildingIds").map((value) => String(value)).filter(Boolean)
}

function assertBuildingSelection(role: string, buildingIds: string[]) {
  if (BUILDING_SCOPED_ROLES.has(role) && buildingIds.length === 0) {
    throw new Error("Назначьте сотруднику хотя бы одно здание")
  }
}

export async function createUserAdmin(formData: FormData) {
  await requireOwner()
  const { orgId } = await requireOrgAccess()
  await requireSubscriptionActive(orgId)
  await checkLimit(orgId, "users")

  const name = String(formData.get("name") ?? "").trim()
  const phone = normalizeKzPhone(formData.get("phone"))
  const email = normalizeEmail(formData.get("email"))
  const role = String(formData.get("role") ?? "TENANT")
  const password = String(formData.get("password") ?? "")
  const position = String(formData.get("position") ?? "").trim()
  const salaryStr = String(formData.get("salary") ?? "")
  const buildingIds = parseBuildingIds(formData)

  if (!name) throw new Error("Имя обязательно")
  if (!phone && !email) throw new Error("Укажите телефон или email")
  if (password.length < 6) throw new Error("Пароль минимум 6 символов")
  assertBuildingSelection(role, buildingIds)

  const hash = await bcrypt.hash(password, 10)

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

  if (["ADMIN", "ACCOUNTANT", "FACILITY_MANAGER"].includes(role)) {
    await db.staff.create({
      data: {
        userId: user.id,
        position: position || role,
        salary: salaryStr ? parseFloat(salaryStr) : 0,
      },
    })
  }
  await replaceUserBuildingAccess(user.id, BUILDING_SCOPED_ROLES.has(role) ? buildingIds : [], orgId)

  revalidatePath("/admin/users")
  revalidatePath("/admin/staff")
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
}

export async function updateUserAdmin(userId: string, formData: FormData) {
  await requireOwner()
  const { orgId } = await requireOrgAccess()
  await assertUserInOrg(userId, orgId)

  const name = String(formData.get("name") ?? "").trim()
  const phone = normalizeKzPhone(formData.get("phone"))
  const email = normalizeEmail(formData.get("email"))
  const role = String(formData.get("role") ?? "")
  const newPassword = String(formData.get("newPassword") ?? "")
  const buildingIds = parseBuildingIds(formData)

  if (!name) throw new Error("Имя обязательно")
  if (role) assertBuildingSelection(role, buildingIds)

  await db.user.update({
    where: { id: userId },
    data: {
      name,
      phone,
      email,
      ...(role ? { role } : {}),
      ...(newPassword ? { password: await bcrypt.hash(newPassword, 10) } : {}),
    },
  })
  if (role) {
    await replaceUserBuildingAccess(userId, BUILDING_SCOPED_ROLES.has(role) ? buildingIds : [], orgId)
  }

  revalidatePath("/admin/users")
  revalidatePath("/admin/staff")
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
}

export async function toggleUserActive(userId: string, isActive: boolean) {
  await requireOwner()
  const { orgId } = await requireOrgAccess()
  await assertUserInOrg(userId, orgId)

  await db.user.update({
    where: { id: userId },
    data: { isActive },
  })

  revalidatePath("/admin/users")
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
}

export async function resetUserPassword(userId: string, newPassword: string) {
  await requireOwner()
  const { orgId } = await requireOrgAccess()
  await assertUserInOrg(userId, orgId)

  if (newPassword.length < 6) throw new Error("Пароль минимум 6 символов")

  await db.user.update({
    where: { id: userId },
    data: { password: await bcrypt.hash(newPassword, 10) },
  })

  revalidatePath("/admin/users")
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
}

export async function deleteUserAdmin(userId: string) {
  const session = await requireOwner()
  const { orgId } = await requireOrgAccess()
  await assertUserInOrg(userId, orgId)

  if (userId === session.id) {
    throw new Error("Нельзя удалить самого себя")
  }

  const tenant = await db.tenant.findUnique({
    where: { userId },
    include: { tenantSpaces: { select: { spaceId: true } } },
  })
  if (tenant) {
    const spaceIds = [...new Set([
      tenant.spaceId,
      ...tenant.tenantSpaces.map((item) => item.spaceId),
    ].filter(Boolean) as string[])]
    if (spaceIds.length > 0) {
      await db.space.updateMany({ where: { id: { in: spaceIds } }, data: { status: "VACANT" } })
    }
    await db.tenant.delete({ where: { id: tenant.id } })
  }

  await db.staff.deleteMany({ where: { userId } })

  await db.user.update({
    where: { id: userId },
    data: { isActive: false },
  })

  revalidatePath("/admin/users")
  revalidatePath("/admin/staff")
  revalidatePath("/admin/tenants")
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
}
