"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { requireOrgAccess } from "@/lib/org"
import { generateApiKeyToken } from "@/lib/api-keys"
import bcrypt from "bcryptjs"

/**
 * Список ключей текущей организации (без plain-токена — только prefix).
 */
export async function listApiKeys() {
  const { orgId } = await requireOrgAccess()
  const keys = await db.apiKey.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scope: true,
      expiresAt: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  })
  return keys
}

/**
 * Создать новый ключ. Возвращает plain-токен — показать пользователю один раз.
 */
export async function createApiKey(opts: {
  name: string
  scope: "READ" | "WRITE"
  expiresInDays?: number | null
}): Promise<{ ok: true; token: string; id: string } | { ok: false; error: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }
  if (session.user.role !== "OWNER") {
    return { ok: false, error: "Только владелец может создавать API-ключи" }
  }
  const { orgId } = await requireOrgAccess()

  const name = opts.name.trim().slice(0, 100)
  if (name.length < 3) return { ok: false, error: "Введите название (минимум 3 символа)" }

  const { token, prefix } = generateApiKeyToken()
  const keyHash = await bcrypt.hash(token, 10)
  const expiresAt = opts.expiresInDays && opts.expiresInDays > 0
    ? new Date(Date.now() + opts.expiresInDays * 24 * 3600 * 1000)
    : null

  const created = await db.apiKey.create({
    data: {
      organizationId: orgId,
      name,
      keyHash,
      keyPrefix: prefix,
      scope: opts.scope,
      expiresAt,
      createdById: session.user.id,
    },
    select: { id: true },
  })

  revalidatePath("/admin/api-keys")
  return { ok: true, token, id: created.id }
}

/**
 * Отозвать ключ (revokedAt = now). Сам ключ остаётся в БД для аудита.
 */
export async function revokeApiKey(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }
  if (session.user.role !== "OWNER") return { ok: false, error: "Только владелец" }
  const { orgId } = await requireOrgAccess()

  const key = await db.apiKey.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true },
  })
  if (!key) return { ok: false, error: "Ключ не найден" }

  await db.apiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
  })

  revalidatePath("/admin/api-keys")
  return { ok: true }
}
