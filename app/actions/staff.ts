"use server"

import { db } from "@/lib/db"
import { revalidatePath, revalidateTag } from "next/cache"
import bcrypt from "bcryptjs"
import { randomBytes } from "node:crypto"
import { requireOrgAccess, checkLimit, requireSubscriptionActive } from "@/lib/org"
import { assertStaffInOrg, assertUserInOrg } from "@/lib/scope-guards"
import { normalizeEmail, normalizeKzPhone } from "@/lib/contact-validation"
import { replaceUserBuildingAccess } from "@/lib/building-access"
import { ADMIN_SHELL_CACHE_TAG } from "@/lib/admin-shell-cache"

// Владелец в организации один — назначить/создать второго нельзя.
const ALLOWED_STAFF_ROLES = new Set(["ADMIN", "ACCOUNTANT", "FACILITY_MANAGER", "EMPLOYEE"])

function parseBuildingIds(formData: FormData) {
  return formData.getAll("buildingIds").map((value) => String(value)).filter(Boolean)
}

function requireBuildingIds(buildingIds: string[]) {
  if (buildingIds.length === 0) throw new Error("Назначьте сотруднику хотя бы одно здание")
}

/** Перехват уникальных ограничений Prisma → человеческое сообщение */
function friendlyUniqueError(e: unknown): never {
  const code = (e as { code?: string })?.code
  if (code === "P2002") {
    throw new Error("Пользователь с таким email или телефоном уже существует")
  }
  throw e
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

  if (!ALLOWED_STAFF_ROLES.has(role)) {
    throw new Error("Недопустимая роль. Владелец в организации один — создать второго нельзя.")
  }

  // Пароль одноразовый: из формы (сгенерирован клиентом) либо случайный.
  // Статических дефолтов вроде «change123» не бывает.
  const oneTimePassword = password && password.length >= 8
    ? password
    : randomBytes(8).toString("base64url")
  const hash = await bcrypt.hash(oneTimePassword, 10)

  const user = await db.user.create({
    data: {
      name,
      phone,
      email,
      password: hash,
      role,
      organizationId: orgId,
      // Пароль выдан администратором — сотрудник обязан сменить при первом входе.
      mustChangePassword: true,
    },
  }).catch(friendlyUniqueError)

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
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
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

  // Роль «Владелец» не назначается и не снимается через эту форму:
  // владелец в организации один, его роль неприкосновенна.
  const currentUser = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (role === "OWNER" && currentUser?.role !== "OWNER") {
    throw new Error("Назначить роль «Владелец» нельзя — владелец в организации один")
  }
  if (currentUser?.role === "OWNER" && role !== "OWNER") {
    throw new Error("Роль владельца изменить нельзя")
  }
  if (role !== "OWNER" && !ALLOWED_STAFF_ROLES.has(role)) {
    throw new Error("Недопустимая роль")
  }

  await db.user.update({
    where: { id: userId },
    data: {
      name,
      phone,
      email,
      role,
      // Пароль, заданный админом, всегда одноразовый — требует смены при входе.
      ...(newPassword ? { password: await bcrypt.hash(newPassword, 10), mustChangePassword: true } : {}),
    },
  }).catch(friendlyUniqueError)

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
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
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
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
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
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
  return { success: true }
}

export async function deleteStaff(staffId: string, userId: string) {
  const { orgId } = await requireOrgAccess()
  await assertStaffInOrg(staffId, orgId)
  await assertUserInOrg(userId, orgId)

  await db.staff.delete({ where: { id: staffId } })
  await db.user.update({ where: { id: userId }, data: { isActive: false } })

  revalidatePath("/admin/staff")
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
}
