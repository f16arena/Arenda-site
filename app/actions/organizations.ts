"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requirePlatformOwner, setImpersonateData, clearImpersonate } from "@/lib/org"
import { audit } from "@/lib/audit"
import bcrypt from "bcryptjs"

export async function createOrganization(formData: FormData): Promise<{ orgId: string; ownerEmail: string | null; ownerPhone: string | null; tempPassword: string }> {
  await requirePlatformOwner()

  const name = String(formData.get("name") ?? "").trim()
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "-")
  const planId = String(formData.get("planId") ?? "")
  const monthsStr = String(formData.get("months") ?? "1")
  const ownerName = String(formData.get("ownerName") ?? "").trim()
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim()
  const ownerPhone = String(formData.get("ownerPhone") ?? "").trim()
  const ownerPassword = String(formData.get("ownerPassword") ?? "").trim() || generatePassword()

  if (!name) throw new Error("Название обязательно")
  if (!slug) throw new Error("Slug обязателен (только латиница, цифры, дефис)")
  if (!planId) throw new Error("Выберите тариф")
  if (!ownerName) throw new Error("Имя владельца обязательно")
  if (!ownerEmail && !ownerPhone) throw new Error("Укажите email или телефон владельца")

  const existing = await db.organization.findUnique({ where: { slug } })
  if (existing) throw new Error(`Организация со slug "${slug}" уже существует`)

  const months = parseInt(monthsStr) || 1
  const planExpiresAt = new Date()
  planExpiresAt.setMonth(planExpiresAt.getMonth() + months)

  // Транзакция
  const hash = await bcrypt.hash(ownerPassword, 10)

  // 1. Организация
  const org = await db.organization.create({
    data: { name, slug, planId, planExpiresAt },
  })

  // 2. Owner-пользователь
  const ownerUser = await db.user.create({
    data: {
      name: ownerName,
      email: ownerEmail || null,
      phone: ownerPhone || null,
      password: hash,
      role: "OWNER",
      organizationId: org.id,
    },
    select: { id: true },
  })

  // 3. Привязать как owner организации
  await db.organization.update({
    where: { id: org.id },
    data: { ownerUserId: ownerUser.id },
  })

  // 4. Запись подписки
  await db.subscription.create({
    data: {
      organizationId: org.id,
      planId,
      expiresAt: planExpiresAt,
      paymentMethod: "MANUAL",
      notes: "Создано платформа-админом",
    },
  })

  await audit({
    action: "CREATE",
    entity: "tenant", // используем tenant как генерик
    entityId: org.id,
    details: { type: "organization", name, slug, ownerEmail, ownerPhone },
  })

  revalidatePath("/superadmin/orgs")
  revalidatePath("/superadmin")

  return {
    orgId: org.id,
    ownerEmail: ownerEmail || null,
    ownerPhone: ownerPhone || null,
    tempPassword: ownerPassword,
  }
}

export async function updateOrganization(orgId: string, formData: FormData) {
  await requirePlatformOwner()

  const name = String(formData.get("name") ?? "").trim()
  const planId = String(formData.get("planId") ?? "")
  const isActive = formData.get("isActive") === "on"
  const isSuspended = formData.get("isSuspended") === "on"

  await db.organization.update({
    where: { id: orgId },
    data: {
      name,
      planId: planId || undefined,
      isActive,
      isSuspended,
    },
  })

  revalidatePath("/superadmin/orgs")
  revalidatePath(`/superadmin/orgs/${orgId}`)
}

export async function extendSubscription(orgId: string, months: number, paidAmount: number) {
  await requirePlatformOwner()

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { planId: true, planExpiresAt: true },
  })
  if (!org?.planId) throw new Error("У организации нет тарифа")

  const baseDate = org.planExpiresAt && org.planExpiresAt > new Date()
    ? new Date(org.planExpiresAt)
    : new Date()
  const newExpiry = new Date(baseDate)
  newExpiry.setMonth(newExpiry.getMonth() + months)

  await db.organization.update({
    where: { id: orgId },
    data: { planExpiresAt: newExpiry, isSuspended: false },
  })

  await db.subscription.create({
    data: {
      organizationId: orgId,
      planId: org.planId,
      startedAt: new Date(),
      expiresAt: newExpiry,
      paidAmount,
      paymentMethod: "MANUAL",
      notes: `Продление на ${months} мес.`,
    },
  })

  revalidatePath(`/superadmin/orgs/${orgId}`)
}

export async function changeOrgOwner(orgId: string, newOwnerId: string) {
  await requirePlatformOwner()

  const user = await db.user.findUnique({ where: { id: newOwnerId }, select: { organizationId: true, role: true } })
  if (!user || user.organizationId !== orgId) {
    throw new Error("Пользователь не принадлежит этой организации")
  }

  await db.organization.update({
    where: { id: orgId },
    data: { ownerUserId: newOwnerId },
  })

  await audit({ action: "UPDATE", entity: "user", entityId: newOwnerId, details: { changed_owner_for_org: orgId } })
  revalidatePath(`/superadmin/orgs/${orgId}`)
}

export async function impersonateOrg(orgId: string) {
  const session = await requirePlatformOwner()
  const owner = await db.user.findFirst({
    where: { organizationId: orgId, role: "OWNER" },
    select: { id: true },
  })
  if (!owner) throw new Error("Owner не найден в этой организации")

  await setImpersonateData({
    actAsUserId: owner.id,
    realUserId: session.userId,
    orgId,
    startedAt: Date.now(),
  })

  await audit({
    action: "UPDATE",
    entity: "user",
    entityId: owner.id,
    details: { impersonate_start: true, orgId, by: session.userId },
  })

  revalidatePath("/admin", "layout")
}

export async function stopImpersonating() {
  await clearImpersonate()
  revalidatePath("/admin", "layout")
}

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  let p = ""
  for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)]
  return p
}
