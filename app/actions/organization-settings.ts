"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { normalizeEmailWithDns, normalizeKzPhone } from "@/lib/contact-validation"
import { assertKazakhstanIin } from "@/lib/kz-iin"
import { DEFAULT_KZ_VAT_RATE, normalizeKzVatRate } from "@/lib/kz-vat"
import { requireOrgAccess } from "@/lib/org"
import { requireAdmin } from "@/lib/permissions"

export async function updateOrganizationVat(orgId: string, formData: FormData) {
  await requireAdmin()
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
  return { success: true }
}

export async function updateOrganizationRequisites(orgId: string, formData: FormData) {
  await requireAdmin()
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
  const phone = normalizeKzPhone(formData.get("phone"), { fieldName: "Телефон владельца" })
  const email = await normalizeEmailWithDns(formData.get("email"), { fieldName: "Email владельца" })

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
      phone,
      email,
    },
  })

  revalidatePath("/admin/settings")
  revalidatePath("/admin/documents")
  revalidatePath("/cabinet/finances")
  return { success: true }
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
