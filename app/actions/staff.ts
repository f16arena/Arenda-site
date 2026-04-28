"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"

export async function createStaff(formData: FormData) {
  const name = formData.get("name") as string
  const phone = formData.get("phone") as string
  const email = formData.get("email") as string
  const role = formData.get("role") as string
  const position = formData.get("position") as string
  const salaryStr = formData.get("salary") as string
  const password = formData.get("password") as string

  const hash = await bcrypt.hash(password || "change123", 10)

  const user = await db.user.create({
    data: {
      name,
      phone: phone || null,
      email: email || null,
      password: hash,
      role,
    },
  })

  await db.staff.create({
    data: {
      userId: user.id,
      position,
      salary: salaryStr ? parseFloat(salaryStr) : 0,
    },
  })

  revalidatePath("/admin/staff")
  return { success: true }
}

export async function updateStaff(staffId: string, userId: string, formData: FormData) {
  const name = formData.get("name") as string
  const phone = formData.get("phone") as string
  const email = formData.get("email") as string
  const role = formData.get("role") as string
  const position = formData.get("position") as string
  const salaryStr = formData.get("salary") as string
  const newPassword = formData.get("newPassword") as string

  await db.user.update({
    where: { id: userId },
    data: {
      name,
      phone: phone || null,
      email: email || null,
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

  revalidatePath("/admin/staff")
  return { success: true }
}

export async function deactivateStaff(userId: string) {
  await db.user.update({
    where: { id: userId },
    data: { isActive: false },
  })

  revalidatePath("/admin/staff")
  return { success: true }
}

export async function reactivateStaff(userId: string) {
  await db.user.update({
    where: { id: userId },
    data: { isActive: true },
  })

  revalidatePath("/admin/staff")
  return { success: true }
}

export async function deleteStaff(staffId: string, userId: string) {
  // Удаляем профиль сотрудника, пользователя — деактивируем (не удаляем,
  // чтобы не сломать ссылки в задачах/комментариях/заявках)
  await db.staff.delete({ where: { id: staffId } })
  await db.user.update({ where: { id: userId }, data: { isActive: false } })

  revalidatePath("/admin/staff")
}
