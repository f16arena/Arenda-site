"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"
import { requirePlatformOwner } from "@/lib/org"
import { audit } from "@/lib/audit"

// Генератор временного пароля (без неоднозначных символов 0/O/1/l/I).
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  let p = ""
  for (let i = 0; i < 12; i++) p += chars[Math.floor(Math.random() * chars.length)]
  return p
}

/**
 * Платформенный сброс пароля ВЛАДЕЛЬЦУ организации.
 * Доступ только платформенному владельцу (requirePlatformOwner редиректит остальных).
 * Сбрасывать можно только аккаунты с ролью OWNER (не платформенных админов).
 * Возвращает сгенерированный пароль — его нужно один раз показать и передать владельцу.
 */
export async function resetOwnerPassword(userId: string): Promise<{ tempPassword: string }> {
  await requirePlatformOwner()

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isPlatformOwner: true },
  })
  if (!user) throw new Error("Пользователь не найден")
  if (user.isPlatformOwner) throw new Error("Здесь нельзя менять пароль платформенного администратора")
  if (user.role !== "OWNER") throw new Error("Сбрасывать пароль здесь можно только владельцам организаций")

  const tempPassword = generateTempPassword()
  const hash = await bcrypt.hash(tempPassword, 10)

  await db.user.update({
    where: { id: userId },
    // mustChangePassword: владелец будет обязан сменить пароль при первом входе.
    data: { password: hash, mustChangePassword: true },
  })

  await audit({
    action: "UPDATE",
    entity: "user",
    entityId: userId,
    details: { reset_owner_password_by_platform: true },
  })

  revalidatePath("/superadmin/users")
  return { tempPassword }
}
