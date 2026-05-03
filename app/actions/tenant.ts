"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireOrgAccess } from "@/lib/org"
import {
  assertTenantInOrg,
  assertSpaceInOrg,
  assertUserInOrg,
} from "@/lib/scope-guards"

function parseNumberOrNull(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim().replace(",", ".")
  if (!raw) return null

  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function parsePositiveNumberOrNull(value: FormDataEntryValue | null) {
  const parsed = parseNumberOrNull(value)
  return parsed !== null && parsed > 0 ? parsed : null
}

/**
 * Добавить арендатора в чёрный список (или снять).
 * Записываем дату и причину. Не удаляет арендатора, не разрывает договор —
 * только пометка для будущих проверок.
 */
export async function setTenantBlacklist(
  tenantId: string,
  payload: { reason: string | null } | null,
) {
  const { orgId } = await requireOrgAccess()
  await assertTenantInOrg(tenantId, orgId)

  if (payload === null) {
    await db.tenant.update({
      where: { id: tenantId },
      data: { blacklistedAt: null, blacklistReason: null },
    })
  } else {
    const reason = (payload.reason ?? "").trim().slice(0, 500) || "Без причины"
    await db.tenant.update({
      where: { id: tenantId },
      data: { blacklistedAt: new Date(), blacklistReason: reason },
    })
  }

  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath("/admin/tenants")
  return { success: true }
}

/**
 * Проверить — есть ли арендатор с таким БИН/ИИН в чёрном списке.
 * Возвращает имя компании и причину, либо null.
 */
export async function checkBlacklist(opts: { bin?: string; iin?: string }) {
  if (!opts.bin && !opts.iin) return null
  const { orgId } = await requireOrgAccess()
  const found = await db.tenant.findFirst({
    where: {
      blacklistedAt: { not: null },
      user: { organizationId: orgId },
      OR: [
        opts.bin ? { bin: opts.bin } : {},
        opts.iin ? { iin: opts.iin } : {},
      ].filter((x) => Object.keys(x).length > 0),
    },
    select: {
      id: true,
      companyName: true,
      blacklistedAt: true,
      blacklistReason: true,
    },
  })
  return found
}

export async function updateTenant(tenantId: string, formData: FormData) {
  const { orgId } = await requireOrgAccess()
  await assertTenantInOrg(tenantId, orgId)

  const companyName = formData.get("companyName") as string
  const bin = formData.get("bin") as string
  const iin = formData.get("iin") as string
  const bankName = formData.get("bankName") as string
  const iik = formData.get("iik") as string
  const bik = formData.get("bik") as string
  const legalType = formData.get("legalType") as string
  const category = formData.get("category") as string
  const legalAddress = formData.get("legalAddress") as string
  const actualAddress = formData.get("actualAddress") as string
  const directorName = formData.get("directorName") as string
  const directorPosition = formData.get("directorPosition") as string
  const customRateStr = formData.get("customRate") as string
  const fixedMonthlyRent = parsePositiveNumberOrNull(formData.get("fixedMonthlyRent"))
  const cleaningFeeStr = formData.get("cleaningFee") as string
  const needsCleaning = formData.get("needsCleaning") === "on"
  const contractStart = formData.get("contractStart") as string
  const contractEnd = formData.get("contractEnd") as string

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      companyName,
      bin: bin || null,
      iin: iin || null,
      bankName: bankName || null,
      iik: iik || null,
      bik: bik || null,
      legalType,
      category: category || null,
      legalAddress: legalAddress || null,
      actualAddress: actualAddress || null,
      directorName: directorName || null,
      directorPosition: directorPosition || null,
      customRate: parseNumberOrNull(customRateStr),
      fixedMonthlyRent,
      cleaningFee: cleaningFeeStr ? parseFloat(cleaningFeeStr) : 0,
      needsCleaning,
      contractStart: contractStart ? new Date(contractStart) : null,
      contractEnd: contractEnd ? new Date(contractEnd) : null,
    },
  })

  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath("/admin/tenants")
  return { success: true }
}

export async function updateTenantRequisites(tenantId: string, formData: FormData) {
  const { orgId } = await requireOrgAccess()
  await assertTenantInOrg(tenantId, orgId)

  const bankName = formData.get("bankName") as string
  const iik = formData.get("iik") as string
  const bik = formData.get("bik") as string
  const bin = formData.get("bin") as string

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      bankName: bankName || null,
      iik: iik || null,
      bik: bik || null,
      bin: bin || null,
    },
  })

  revalidatePath(`/admin/tenants/${tenantId}`)
  return { success: true }
}

export async function updateTenantRentalTerms(tenantId: string, formData: FormData) {
  const { orgId } = await requireOrgAccess()
  await assertTenantInOrg(tenantId, orgId)

  const customRateStr = formData.get("customRate") as string
  const fixedMonthlyRent = parsePositiveNumberOrNull(formData.get("fixedMonthlyRent"))
  const cleaningFeeStr = formData.get("cleaningFee") as string
  const needsCleaning = formData.get("needsCleaning") === "on"
  const paymentDueDayStr = formData.get("paymentDueDay") as string
  const penaltyPercentStr = formData.get("penaltyPercent") as string
  const isVatPayer = formData.get("isVatPayer") === "on"

  let paymentDueDay = 10
  if (paymentDueDayStr) {
    const n = parseInt(paymentDueDayStr, 10)
    if (isFinite(n) && n >= 1 && n <= 31) paymentDueDay = n
  }

  let penaltyPercent = 1
  if (penaltyPercentStr) {
    const n = parseFloat(penaltyPercentStr.replace(",", "."))
    if (isFinite(n) && n >= 0 && n <= 100) penaltyPercent = n
  }

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      customRate: parseNumberOrNull(customRateStr),
      fixedMonthlyRent,
      cleaningFee: cleaningFeeStr ? parseFloat(cleaningFeeStr) : 0,
      needsCleaning,
      paymentDueDay,
      penaltyPercent,
      isVatPayer,
    },
  })

  revalidatePath(`/admin/tenants/${tenantId}`)
  return { success: true }
}

export async function updateTenantUser(userId: string, tenantId: string, formData: FormData) {
  const { orgId } = await requireOrgAccess()
  await assertTenantInOrg(tenantId, orgId)
  await assertUserInOrg(userId, orgId)

  const name = formData.get("name") as string
  const phone = formData.get("phone") as string
  const email = formData.get("email") as string

  await db.user.update({
    where: { id: userId },
    data: {
      name,
      phone: phone || null,
      email: email || null,
    },
  })

  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath("/admin/tenants")
  return { success: true }
}

/**
 * Подсчитать связи арендатора, которые мешают удалению.
 * Возвращает {ok: true} если можно удалять чисто, либо подробную раскладку.
 */
export async function getTenantDeleteBlockers(tenantId: string) {
  const { orgId } = await requireOrgAccess()
  await assertTenantInOrg(tenantId, orgId)

  const [
    chargesCount,
    paymentsCount,
    contractsCount,
    documentsCount,
    requestsCount,
    fullFloorsCount,
    spaceLink,
  ] = await Promise.all([
    db.charge.count({ where: { tenantId } }),
    db.payment.count({ where: { tenantId } }),
    db.contract.count({ where: { tenantId } }),
    db.tenantDocument.count({ where: { tenantId } }),
    db.request.count({ where: { tenantId } }),
    db.floor.count({ where: { fullFloorTenantId: tenantId } }),
    db.tenant.findUnique({ where: { id: tenantId }, select: { spaceId: true } }),
  ])

  return {
    charges: chargesCount,
    payments: paymentsCount,
    contracts: contractsCount,
    documents: documentsCount,
    requests: requestsCount,
    fullFloors: fullFloorsCount,
    hasSpace: !!spaceLink?.spaceId,
  }
}

export async function deleteTenant(
  tenantId: string,
  options?: { redirectAfter?: boolean; force?: boolean },
) {
  const { orgId } = await requireOrgAccess()
  await assertTenantInOrg(tenantId, orgId)

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, userId: true, spaceId: true, companyName: true },
  })
  if (!tenant) throw new Error("Арендатор не найден")

  // Без force — проверяем связи и кидаем структурированную ошибку
  if (!options?.force) {
    const b = await getTenantDeleteBlockers(tenantId)
    const reasons: string[] = []
    if (b.charges > 0) reasons.push(`${b.charges} начислени${b.charges === 1 ? "е" : "й"}`)
    if (b.payments > 0) reasons.push(`${b.payments} платеж${b.payments === 1 ? "" : "ей"}`)
    if (b.contracts > 0) reasons.push(`${b.contracts} договор${b.contracts === 1 ? "" : "ов"}`)
    if (b.documents > 0) reasons.push(`${b.documents} документ${b.documents === 1 ? "" : "ов"}`)
    if (b.requests > 0) reasons.push(`${b.requests} заявок`)
    if (b.fullFloors > 0) reasons.push(`${b.fullFloors} этаж${b.fullFloors === 1 ? "" : "ей"} сданы целиком`)

    if (reasons.length > 0) {
      throw new Error(
        `Нельзя удалить «${tenant.companyName}» — связан с: ${reasons.join(", ")}. ` +
          `Используйте каскадное удаление чтобы стереть всё вместе.`,
      )
    }
  }

  // Force-удаление: чистим все зависимости в транзакции
  await db.$transaction([
    // Освобождаем помещение
    ...(tenant.spaceId
      ? [db.space.update({ where: { id: tenant.spaceId }, data: { status: "VACANT" } })]
      : []),
    // Снимаем full-floor привязки
    db.floor.updateMany({
      where: { fullFloorTenantId: tenantId },
      data: { fullFloorTenantId: null, fixedMonthlyRent: null },
    }),
    // Документы помещений
    db.tenantDocument.deleteMany({ where: { tenantId } }),
    // Заявки и комментарии к ним
    db.requestComment.deleteMany({ where: { request: { tenantId } } }),
    db.request.deleteMany({ where: { tenantId } }),
    // Договоры
    db.contract.deleteMany({ where: { tenantId } }),
    // Финансы
    db.payment.deleteMany({ where: { tenantId } }),
    db.charge.deleteMany({ where: { tenantId } }),
    // Сам арендатор
    db.tenant.delete({ where: { id: tenantId } }),
    // Деактивируем пользователя — историю не теряем
    db.user.update({ where: { id: tenant.userId }, data: { isActive: false } }),
  ])

  revalidatePath("/admin/tenants")
  revalidatePath("/admin/spaces")

  if (options?.redirectAfter) redirect("/admin/tenants")
}

export async function assignTenantSpace(tenantId: string, spaceId: string | null) {
  const { orgId } = await requireOrgAccess()
  await assertTenantInOrg(tenantId, orgId)
  if (spaceId) await assertSpaceInOrg(spaceId, orgId)

  const tenant = await db.tenant.findUnique({ where: { id: tenantId } })

  if (spaceId) {
    // Помещение должно быть на не-полностью-арендованном этаже
    const { assertSpaceAssignable } = await import("@/lib/full-floor-guards")
    await assertSpaceAssignable(spaceId)
    // И не должно быть уже занято другим
    const target = await db.space.findUnique({
      where: { id: spaceId },
      select: { number: true, tenant: { select: { companyName: true, id: true } } },
    })
    if (target?.tenant && target.tenant.id !== tenantId) {
      throw new Error(
        `Кабинет ${target.number} уже занят арендатором «${target.tenant.companyName}». Сначала выселите.`,
      )
    }
  }

  // Атомарно: освобождаем старое помещение, занимаем новое, переключаем привязку.
  // Если что-то упадёт — БД останется в консистентном состоянии.
  await db.$transaction([
    ...(tenant?.spaceId
      ? [db.space.update({ where: { id: tenant.spaceId }, data: { status: "VACANT" } })]
      : []),
    ...(spaceId
      ? [db.space.update({ where: { id: spaceId }, data: { status: "OCCUPIED" } })]
      : []),
    db.tenant.update({
      where: { id: tenantId },
      data: { spaceId: spaceId || null },
    }),
  ])

  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath("/admin/tenants")
  revalidatePath("/admin/spaces")
  return { success: true }
}
