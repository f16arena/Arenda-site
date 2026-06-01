"use server"

import { revalidatePath, revalidateTag } from "next/cache"
import { db } from "@/lib/db"
import { normalizeEmailWithDns, normalizeKzPhone } from "@/lib/contact-validation"
import { assertKazakhstanIin } from "@/lib/kz-iin"
import { DEFAULT_KZ_VAT_RATE, normalizeKzVatRate } from "@/lib/kz-vat"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { ADMIN_SHELL_CACHE_TAG } from "@/lib/admin-shell-cache"

// Возвращаем ошибку вместо throw: в проде Next затирает текст брошенных из
// server action ошибок («…omitted in production…» + digest), а возвращённые
// значения отдаёт клиенту как есть. ServerForm показывает result.error в тосте,
// поэтому пользователь видит реальную причину (неверный ИИК/ИИН, мёртвый домен
// email и т.п.), а не бесполезный общий текст.
function fail(error: unknown) {
  return {
    success: false as const,
    error: error instanceof Error ? error.message : "Не удалось сохранить",
  }
}

/** Org-флаги, которые владелец переключает сам (хранятся в Organization.features JSON). */
export async function updateOrganizationFeatures(orgId: string, formData: FormData) {
  try {
    await requireCapabilityAndFeature("settings.updateOrganization")
    const { orgId: scopeOrgId } = await requireOrgAccess()
    if (scopeOrgId !== orgId) throw new Error("Нет доступа к этой организации")

    const org = await db.organization.findUnique({ where: { id: orgId }, select: { features: true } })
    let features: Record<string, unknown> = {}
    try { const v = JSON.parse(org?.features ?? "{}"); if (v && typeof v === "object") features = v } catch { /* ignore */ }

    // Чекбокс «Дополнительные начисления включены». Отмечен → раздел показывается.
    features.additionalChargesDisabled = formData.get("additionalChargesEnabled") !== "on"

    await db.organization.update({ where: { id: orgId }, data: { features: JSON.stringify(features) } })

    revalidatePath("/admin/settings")
    revalidatePath("/admin/tenants", "layout")
    revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
    return { success: true }
  } catch (e) {
    return fail(e)
  }
}

/** Налоговая ставка для отчёта владельца (хранится в Organization.features JSON). */
export async function updateOrganizationTax(orgId: string, formData: FormData) {
  try {
    await requireCapabilityAndFeature("settings.updateOrganization")
    const { orgId: scopeOrgId } = await requireOrgAccess()
    if (scopeOrgId !== orgId) throw new Error("Нет доступа к этой организации")

    const org = await db.organization.findUnique({ where: { id: orgId }, select: { features: true } })
    let features: Record<string, unknown> = {}
    try { const v = JSON.parse(org?.features ?? "{}"); if (v && typeof v === "object") features = v } catch { /* ignore */ }

    const raw = String(formData.get("taxRatePercent") ?? "").trim().replace(",", ".")
    const parsed = parseFloat(raw)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 20) {
      throw new Error("Ставка налога должна быть числом от 0 до 20%")
    }
    features.taxRatePercent = Math.round(parsed * 100) / 100
    const regime = String(formData.get("taxRegime") ?? "").trim()
    if (regime) features.taxRegime = regime.slice(0, 60)

    await db.organization.update({ where: { id: orgId }, data: { features: JSON.stringify(features) } })

    revalidatePath("/admin/settings")
    revalidatePath("/admin/reports")
    revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
    return { success: true }
  } catch (e) {
    return fail(e)
  }
}

export async function updateOrganizationVat(orgId: string, formData: FormData) {
  try {
    await requireCapabilityAndFeature("settings.updateOrganization")
    const { orgId: scopeOrgId } = await requireOrgAccess()
    if (scopeOrgId !== orgId) throw new Error("Нет доступа к этой организации")

    const isVatPayer = formData.get("isVatPayer") === "on"
    const vatNumber = String(formData.get("vatNumber") ?? "").trim()
    const vatRate = normalizeKzVatRate(formData.get("vatRate"), DEFAULT_KZ_VAT_RATE)

    await db.organization.update({
      where: { id: orgId },
      data: {
        isVatPayer,
        vatRate: isVatPayer ? vatRate : DEFAULT_KZ_VAT_RATE,
        vatNumber: vatNumber || null,
      },
    })

    revalidatePath("/admin/settings")
    revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
    return { success: true }
  } catch (e) {
    return fail(e)
  }
}

export async function updateOrganizationRequisites(orgId: string, formData: FormData) {
  try {
    await requireCapabilityAndFeature("settings.updateBankDetails")
    const { orgId: scopeOrgId } = await requireOrgAccess()
    if (scopeOrgId !== orgId) throw new Error("Нет доступа к этой организации")

    const legalType = normalizeLegalType(formData.get("legalType"))
  const legalName = requiredText(formData.get("legalName"), "Полное название")
  const shortName = optionalText(formData.get("shortName"))
  const directorName = requiredText(formData.get("directorName"), "ФИО руководителя")
  const directorPosition = optionalText(formData.get("directorPosition"))
  const basis = requiredText(formData.get("basis"), "Основание действия")
  const legalAddress = requiredText(formData.get("legalAddress"), "Юридический адрес")
  const actualAddress = optionalText(formData.get("actualAddress"))
  const bankName = optionalText(formData.get("bankName"))
  const iik = normalizeIik(formData.get("iik"))
  const bik = normalizeBik(formData.get("bik"))
  const secondBankName = optionalText(formData.get("secondBankName"))
  const secondIik = normalizeIik(formData.get("secondIik"))
  const secondBik = normalizeBik(formData.get("secondBik"))
  const kbe = optionalText(formData.get("kbe"))
  const knp = optionalText(formData.get("knp"))
  const phone = normalizeKzPhone(formData.get("phone"), { fieldName: "Телефон владельца" })
  const email = await normalizeEmailWithDns(formData.get("email"), { fieldName: "Email владельца" })
  // Дефолт пени по договорам. Принимаем "0.5", "0,5", "1" — нормализуем через
  // запятую → точку. Clamp [0, 10] — больше 10% бессмысленно (зеркальный потолок).
  const rawPenalty = String(formData.get("defaultPenaltyPercent") ?? "").trim().replace(",", ".")
  const parsedPenalty = parseFloat(rawPenalty)
  const defaultPenaltyPercent = Number.isFinite(parsedPenalty)
    ? Math.min(Math.max(parsedPenalty, 0), 10)
    : 0.5

  validateOptionalBankAccount(bankName, iik, bik, "Основной счёт")
  validateOptionalBankAccount(secondBankName, secondIik, secondBik, "Второй счёт")

  let bin: string | null = null
  let iin: string | null = null
  if (legalType === "IP" || legalType === "PHYSICAL") {
    iin = assertKazakhstanIin(formData.get("iin"), "ИИН")
  } else if (legalType === "TOO" || legalType === "AO") {
    bin = normalizeBin(formData.get("bin"), true)
    iin = normalizeOptionalIin(formData.get("iin"), "ИИН")
  } else {
    bin = normalizeBin(formData.get("bin"), false)
    iin = normalizeOptionalIin(formData.get("iin"), "ИИН")
  }

  await db.organization.update({
    where: { id: orgId },
    data: {
      legalType,
      legalName,
      shortName,
      bin,
      iin,
      directorName,
      directorPosition,
      basis,
      legalAddress,
      actualAddress,
      bankName,
      iik,
      bik,
      secondBankName,
      secondIik,
      secondBik,
      kbe,
      knp,
      phone,
      email,
      defaultPenaltyPercent,
    },
  })

    revalidatePath("/admin/settings")
    revalidatePath("/admin/documents")
    revalidatePath("/cabinet/finances")
    revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
    return { success: true }
  } catch (e) {
    return fail(e)
  }
}

function normalizeLegalType(value: FormDataEntryValue | null) {
  const legalType = String(value ?? "").trim().toUpperCase()
  if (["IP", "TOO", "AO", "PHYSICAL", "OTHER"].includes(legalType)) return legalType
  return "IP"
}

function requiredText(value: FormDataEntryValue | null, label: string) {
  const text = optionalText(value)
  if (!text) throw new Error(`Заполните поле «${label}»`)
  return text
}

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ")
  return text.length > 0 ? text : null
}

function normalizeBin(value: FormDataEntryValue | null, required: boolean) {
  const digits = String(value ?? "").replace(/\D/g, "")
  if (!digits) {
    if (required) throw new Error("БИН должен состоять из 12 цифр")
    return null
  }
  if (digits.length !== 12 || /^(\d)\1{11}$/.test(digits)) {
    throw new Error("БИН должен состоять из 12 корректных цифр")
  }
  return digits
}

function normalizeOptionalIin(value: FormDataEntryValue | null, label: string) {
  const digits = String(value ?? "").replace(/\D/g, "")
  if (!digits) return null
  return assertKazakhstanIin(digits, label)
}

function normalizeIik(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim().replace(/\s+/g, "").toUpperCase()
  if (!text) return null
  if (!/^KZ[A-Z0-9]{18}$/.test(text)) {
    throw new Error("ИИК должен быть в формате KZ + 18 символов")
  }
  return text
}

function normalizeBik(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim().replace(/\s+/g, "").toUpperCase()
  if (!text) return null
  if (!/^[A-Z0-9]{8,11}$/.test(text)) {
    throw new Error("БИК должен содержать 8-11 латинских букв или цифр")
  }
  return text
}

function validateOptionalBankAccount(
  bankName: string | null,
  iik: string | null,
  bik: string | null,
  label: string,
) {
  const hasAny = !!bankName || !!iik || !!bik
  if (!hasAny) return
  if (!bankName || !iik || !bik) {
    throw new Error(`${label}: заполните название банка, ИИК и БИК либо оставьте счёт пустым`)
  }
}
