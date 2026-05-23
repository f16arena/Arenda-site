"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireOrgAccess } from "@/lib/org"
import { requirePlatformOwner } from "@/lib/org"
import { notifyUser } from "@/lib/notify"
import { SERVICES_CATALOG } from "@/lib/services-catalog"
import { revalidatePath } from "next/cache"

/**
 * Клиент заказывает разовую услугу: создаём OrganizationService(status=PENDING)
 * + уведомляем платформ-админов. Оплата вручную, активацию делает супер-админ.
 */
export async function requestService(input: {
  serviceCode: string
  notes?: string
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth()
  if (!session?.user || session.user.role === "TENANT") {
    return { ok: false, error: "Не авторизован" }
  }
  const { orgId } = await requireOrgAccess()

  const item = SERVICES_CATALOG.find((s) => s.code === input.serviceCode)
  if (!item) return { ok: false, error: "Услуга не найдена" }

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { name: true, plan: { select: { code: true } } },
  })
  if (!org) return { ok: false, error: "Организация не найдена" }
  const planCode = org.plan?.code ?? null
  if (item.requiresPlan && (!planCode || !item.requiresPlan.includes(planCode))) {
    return { ok: false, error: `Услуга доступна на тарифах: ${item.requiresPlan.join(" / ")}` }
  }
  if (item.hiddenForPlans?.includes(planCode ?? "")) {
    return { ok: false, error: "Эта услуга недоступна на вашем тарифе" }
  }

  await db.organizationService.create({
    data: {
      organizationId: orgId,
      serviceCode: item.code,
      serviceName: item.label,
      price: item.price,
      status: "PENDING",
      notes: input.notes?.trim() || `Заявка от ${session.user.name ?? session.user.email ?? "клиента"}`,
    },
  })

  const platformOwners = await db.user.findMany({
    where: { isPlatformOwner: true, isActive: true },
    select: { id: true },
  })
  await Promise.all(platformOwners.map((u) =>
    notifyUser({
      userId: u.id,
      type: "SERVICE_REQUEST",
      title: `Заявка на услугу: ${item.label}`,
      message: `${org.name} запросил «${item.label}» (${item.price.toLocaleString("ru-RU")} ₸). Тариф: ${planCode ?? "—"}.`,
      link: "/superadmin/services",
      sendEmail: false,
    }).catch(() => null),
  ))

  revalidatePath("/admin/subscription")
  return { ok: true }
}

/**
 * Суперадмин помечает услугу как оплаченную (PENDING → PAID).
 */
export async function markServicePaid(input: {
  serviceId: string
  paymentMethod?: string
}): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformOwner()
  const svc = await db.organizationService.findUnique({
    where: { id: input.serviceId },
    include: { organization: { select: { id: true, name: true, ownerUserId: true } } },
  })
  if (!svc) return { ok: false, error: "Услуга не найдена" }
  if (svc.status !== "PENDING") return { ok: false, error: `Услуга уже в статусе ${svc.status}` }

  await db.organizationService.update({
    where: { id: input.serviceId },
    data: { status: "PAID", paidAt: new Date(), paymentMethod: input.paymentMethod ?? null },
  })
  if (svc.organization.ownerUserId) {
    await notifyUser({
      userId: svc.organization.ownerUserId,
      type: "SERVICE_PAID",
      title: `Оплата получена: ${svc.serviceName}`,
      message: `Спасибо за оплату «${svc.serviceName}». Команда уже взяла задачу в работу.`,
      link: "/admin/subscription",
      sendEmail: false,
    }).catch(() => null)
  }
  revalidatePath("/superadmin/services")
  return { ok: true }
}

/**
 * Суперадмин помечает услугу как выполненную (PAID → DELIVERED).
 */
export async function markServiceDelivered(input: {
  serviceId: string
}): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformOwner()
  const svc = await db.organizationService.findUnique({
    where: { id: input.serviceId },
    include: { organization: { select: { id: true, name: true, ownerUserId: true } } },
  })
  if (!svc) return { ok: false, error: "Услуга не найдена" }

  await db.organizationService.update({
    where: { id: input.serviceId },
    data: { status: "DELIVERED", deliveredAt: new Date() },
  })
  if (svc.organization.ownerUserId) {
    await notifyUser({
      userId: svc.organization.ownerUserId,
      type: "SERVICE_DELIVERED",
      title: `Услуга выполнена: ${svc.serviceName}`,
      message: `«${svc.serviceName}» — готово. Если что-то нужно поправить — пишите.`,
      link: "/admin/subscription",
      sendEmail: false,
    }).catch(() => null)
  }
  revalidatePath("/superadmin/services")
  return { ok: true }
}

/**
 * Суперадмин отменяет услугу (любой статус → CANCELLED).
 */
export async function cancelService(input: {
  serviceId: string
  reason?: string
}): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformOwner()
  const svc = await db.organizationService.findUnique({
    where: { id: input.serviceId },
    include: { organization: { select: { id: true, name: true, ownerUserId: true } } },
  })
  if (!svc) return { ok: false, error: "Услуга не найдена" }

  await db.organizationService.update({
    where: { id: input.serviceId },
    data: {
      status: "CANCELLED",
      notes: svc.notes
        ? `${svc.notes}\n[отменена: ${input.reason ?? "—"}]`
        : `[отменена: ${input.reason ?? "—"}]`,
    },
  })
  if (svc.organization.ownerUserId) {
    await notifyUser({
      userId: svc.organization.ownerUserId,
      type: "SERVICE_CANCELLED",
      title: `Услуга отменена: ${svc.serviceName}`,
      message: input.reason ?? "Заявка отменена.",
      link: "/admin/subscription",
      sendEmail: false,
    }).catch(() => null)
  }
  revalidatePath("/superadmin/services")
  return { ok: true }
}
