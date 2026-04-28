"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireOwner } from "@/lib/permissions"
import bcrypt from "bcryptjs"

export async function createUserAdmin(formData: FormData) {
  await requireOwner()

  const name = String(formData.get("name") ?? "").trim()
  const phone = String(formData.get("phone") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim()
  const role = String(formData.get("role") ?? "TENANT")
  const password = String(formData.get("password") ?? "")
  const position = String(formData.get("position") ?? "").trim()
  const salaryStr = String(formData.get("salary") ?? "")

  if (!name) throw new Error("Имя обязательно")
  if (!phone && !email) throw new Error("Укажите телефон или email")
  if (password.length < 6) throw new Error("Пароль минимум 6 символов")

  const hash = await bcrypt.hash(password, 10)

  const user = await db.user.create({
    data: {
      name,
      phone: phone || null,
      email: email || null,
      password: hash,
      role,
    },
  })

  // Если это сотрудник — создаём профиль staff
  if (["ADMIN", "ACCOUNTANT", "FACILITY_MANAGER"].includes(role)) {
    await db.staff.create({
      data: {
        userId: user.id,
        position: position || role,
        salary: salaryStr ? parseFloat(salaryStr) : 0,
      },
    })
  }

  revalidatePath("/admin/users")
  revalidatePath("/admin/staff")
}

export async function updateUserAdmin(userId: string, formData: FormData) {
  await requireOwner()

  const name = String(formData.get("name") ?? "").trim()
  const phone = String(formData.get("phone") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim()
  const role = String(formData.get("role") ?? "")
  const newPassword = String(formData.get("newPassword") ?? "")

  if (!name) throw new Error("Имя обязательно")

  await db.user.update({
    where: { id: userId },
    data: {
      name,
      phone: phone || null,
      email: email || null,
      ...(role ? { role } : {}),
      ...(newPassword ? { password: await bcrypt.hash(newPassword, 10) } : {}),
    },
  })

  revalidatePath("/admin/users")
}

export async function toggleUserActive(userId: string, isActive: boolean) {
  await requireOwner()

  await db.user.update({
    where: { id: userId },
    data: { isActive },
  })

  revalidatePath("/admin/users")
}

export async function resetUserPassword(userId: string, newPassword: string) {
  await requireOwner()

  if (newPassword.length < 6) throw new Error("Пароль минимум 6 символов")

  await db.user.update({
    where: { id: userId },
    data: { password: await bcrypt.hash(newPassword, 10) },
  })

  revalidatePath("/admin/users")
}

export async function deleteUserAdmin(userId: string) {
  const session = await requireOwner()

  if (userId === session.id) {
    throw new Error("Нельзя удалить самого себя")
  }

  // Проверяем есть ли связанный профиль арендатора — каскадом удалится через tenant
  const tenant = await db.tenant.findUnique({ where: { userId } })
  if (tenant) {
    if (tenant.spaceId) {
      await db.space.update({ where: { id: tenant.spaceId }, data: { status: "VACANT" } })
    }
    await db.tenant.delete({ where: { id: tenant.id } })
  }

  // Удаляем staff-профиль если есть
  await db.staff.deleteMany({ where: { userId } })

  // Деактивируем пользователя (оставляем запись для истории — иначе сломаются комментарии/задачи)
  await db.user.update({
    where: { id: userId },
    data: { isActive: false },
  })

  revalidatePath("/admin/users")
  revalidatePath("/admin/staff")
  revalidatePath("/admin/tenants")
}
