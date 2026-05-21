"use server"

import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { requireOrgAccess, requirePlatformOwner } from "@/lib/org"
import { ADMIN_SHELL_CACHE_TAG } from "@/lib/admin-shell-cache"
import {
  APPROVAL_APPROVED,
  APPROVAL_PENDING,
  APPROVAL_REJECTED,
  approvalLabel,
} from "@/lib/approval"
import { revalidatePath, revalidateTag } from "next/cache"

const TRIAL_DAYS = 14

function rejectionReasonFrom(formData: FormData) {
  return String(formData.get("reason") ?? "").trim() || "Отклонено без комментария"
}

export async function approveOrganizationRegistration(orgId: string) {
  const platform = await requirePlatformOwner()
  const now = new Date()
  const expiresAt = new Date(now)
  expiresAt.setDate(expiresAt.getDate() + TRIAL_DAYS)

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      slug: true,
      ownerUserId: true,
      planId: true,
      approvalStatus: true,
    },
  })
  if (!org) throw new Error("Организация не найдена")
  if (org.approvalStatus === APPROVAL_APPROVED) {
    throw new Error("Организация уже подтверждена")
  }

  let planId = org.planId
  if (!planId) {
    // Предпочитаем TRIAL, иначе FREE, иначе любой активный тариф — чтобы
    // подтверждение не падало с ошибкой, если плана TRIAL нет.
    const plan =
      (await db.plan.findFirst({ where: { code: "TRIAL", isActive: true }, select: { id: true } }))
      ?? (await db.plan.findFirst({ where: { code: "FREE", isActive: true }, select: { id: true } }))
      ?? (await db.plan.findFirst({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true } }))
    if (!plan) throw new Error("Нет доступного тарифа — создайте тариф в разделе «Тарифы»")
    planId = plan.id
  }

  await db.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: org.id },
      data: {
        isActive: true,
        isSuspended: false,
        approvalStatus: APPROVAL_APPROVED,
        approvedAt: now,
        approvedById: platform.userId,
        rejectionReason: null,
        planId,
        planExpiresAt: expiresAt,
      },
    })

    if (org.ownerUserId) {
      await tx.user.update({
        where: { id: org.ownerUserId },
        data: {
          isActive: true,
          approvalStatus: APPROVAL_APPROVED,
          approvedAt: now,
          approvedById: platform.userId,
          rejectionReason: null,
        },
      })
    }

    const existingSubscription = await tx.subscription.findFirst({
      where: { organizationId: org.id },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    })

    if (existingSubscription) {
      await tx.subscription.update({
        where: { id: existingSubscription.id },
        data: {
          planId,
          startedAt: now,
          expiresAt,
          status: "ACTIVE",
          paymentMethod: "TRIAL",
          notes: "Подтверждена суперадмином · 14-дневный триал",
        },
      })
    } else {
      await tx.subscription.create({
        data: {
          organizationId: org.id,
          planId,
          startedAt: now,
          expiresAt,
          status: "ACTIVE",
          paymentMethod: "TRIAL",
          notes: "Подтверждена суперадмином · 14-дневный триал",
        },
      })
    }
  })

  await audit({
    action: "UPDATE",
    entity: "tenant",
    entityId: org.id,
    details: { type: "organization_registration", slug: org.slug, by: platform.userId },
  })

  revalidatePath("/superadmin")
  revalidatePath("/superadmin/orgs")
  revalidatePath(`/superadmin/orgs/${org.id}`)
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
}

export async function rejectOrganizationRegistration(orgId: string, formData: FormData) {
  const platform = await requirePlatformOwner()
  const reason = rejectionReasonFrom(formData)
  const now = new Date()

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { id: true, name: true, slug: true, ownerUserId: true, approvalStatus: true },
  })
  if (!org) throw new Error("Организация не найдена")
  if (org.approvalStatus === APPROVAL_APPROVED) {
    throw new Error("Подтвержденную организацию нельзя отклонить. Используйте приостановку или деактивацию.")
  }

  await db.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: org.id },
      data: {
        isActive: false,
        isSuspended: false,
        approvalStatus: APPROVAL_REJECTED,
        approvedAt: now,
        approvedById: platform.userId,
        rejectionReason: reason,
      },
    })
    if (org.ownerUserId) {
      await tx.user.update({
        where: { id: org.ownerUserId },
        data: {
          isActive: true,
          approvalStatus: APPROVAL_REJECTED,
          approvedAt: now,
          approvedById: platform.userId,
          rejectionReason: reason,
        },
      })
    }
  })

  await audit({
    action: "UPDATE",
    entity: "tenant",
    entityId: org.id,
    details: { type: "organization_registration", slug: org.slug, reason, by: platform.userId },
  })

  revalidatePath("/superadmin")
  revalidatePath("/superadmin/orgs")
  revalidatePath(`/superadmin/orgs/${org.id}`)
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
}

async function requireOwnerApprovalAuthority() {
  const context = await requireOrgAccess()
  const actor = await db.user.findFirst({
    where: { id: context.userId, organizationId: context.orgId },
    select: { id: true, role: true, isPlatformOwner: true },
  })
  if (!actor && !context.isPlatformOwner) throw new Error("Пользователь не найден")
  if (!context.isPlatformOwner && actor?.role !== "OWNER") {
    throw new Error("Подтверждать пользователей может только владелец организации")
  }
  return { ...context, actorId: actor?.id ?? context.userId }
}

export async function approveUserRegistration(userId: string) {
  const context = await requireOwnerApprovalAuthority()
  const target = await db.user.findFirst({
    where: { id: userId, organizationId: context.orgId },
    select: { id: true, name: true, role: true, approvalStatus: true },
  })
  if (!target) throw new Error("Пользователь не найден")
  if (target.role === "OWNER" && !context.isPlatformOwner) {
    throw new Error("Владельца организации подтверждает только суперадмин")
  }

  await db.user.update({
    where: { id: target.id },
    data: {
      isActive: true,
      approvalStatus: APPROVAL_APPROVED,
      approvedAt: new Date(),
      approvedById: context.actorId,
      rejectionReason: null,
    },
  })

  await audit({
    action: "UPDATE",
    entity: "user",
    entityId: target.id,
    details: { type: "user_registration", role: target.role, by: context.actorId },
  })

  revalidatePath("/admin/users")
  revalidatePath("/admin/staff")
  revalidatePath("/admin/tenants")
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
}

export async function rejectUserRegistration(userId: string, formData: FormData) {
  const context = await requireOwnerApprovalAuthority()
  const reason = rejectionReasonFrom(formData)
  const target = await db.user.findFirst({
    where: { id: userId, organizationId: context.orgId },
    select: { id: true, name: true, role: true, approvalStatus: true },
  })
  if (!target) throw new Error("Пользователь не найден")
  if (target.role === "OWNER" && !context.isPlatformOwner) {
    throw new Error("Владельца организации подтверждает только суперадмин")
  }
  if (target.approvalStatus !== APPROVAL_PENDING) {
    throw new Error(`Пользователь сейчас в статусе: ${approvalLabel(target.approvalStatus)}`)
  }

  await db.user.update({
    where: { id: target.id },
    data: {
      isActive: true,
      approvalStatus: APPROVAL_REJECTED,
      approvedAt: new Date(),
      approvedById: context.actorId,
      rejectionReason: reason,
    },
  })

  await audit({
    action: "UPDATE",
    entity: "user",
    entityId: target.id,
    details: { type: "user_registration", role: target.role, reason, by: context.actorId },
  })

  revalidatePath("/admin/users")
  revalidatePath("/admin/staff")
  revalidatePath("/admin/tenants")
  revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
}
