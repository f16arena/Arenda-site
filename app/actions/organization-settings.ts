"use server"

import { revalidatePath, revalidateTag } from "next/cache"
import { db } from "@/lib/db"
import { normalizeEmailWithDns, normalizeKzPhone } from "@/lib/contact-validation"
import { assertKazakhstanIin, type KzIinIssue } from "@/lib/kz-iin"
import { getT } from "@/lib/i18n/server"
import { DEFAULT_KZ_VAT_RATE, normalizeKzVatRate } from "@/lib/kz-vat"
import { requireOrgAccess } from "@/lib/org"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { ADMIN_SHELL_CACHE_TAG } from "@/lib/admin-shell-cache"
import { applyDocNumberStart } from "@/lib/document-number"

// Возвращаем ошибку вместо throw: в проде Next затирает текст брошенных из
// server action ошибок («…omitted in production…» + digest), а возвращённые
// значения отдаёт клиенту как есть. ServerForm показывает result.error в тосте,
// поэтому пользователь видит реальную причину (неверный ИИК/ИИН, мёртвый домен
// email и т.п.), а не бесполезный общий текст.
function fail(error: unknown, saveFailed: string) {
  return {
    success: false as const,
    error: error instanceof Error ? error.message : saveFailed,
  }
}

/** Org-флаги, которые владелец переключает сам (хранятся в Organization.features JSON). */
export async function updateOrganizationFeatures(orgId: string, formData: FormData) {
  const { t } = await getT()
  try {
    await requireCapabilityAndFeature("settings.updateOrganization")
    const { orgId: scopeOrgId } = await requireOrgAccess()
    if (scopeOrgId !== orgId) throw new Error(t("actions.organizationSettings.noAccess"))

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
    return fail(e, t("actions.organizationSettings.saveFailed"))
  }
}

/** Налоговая ставка для отчёта владельца (хранится в Organization.features JSON). */
export async function updateOrganizationTax(orgId: string, formData: FormData) {
  const { t } = await getT()
  try {
    await requireCapabilityAndFeature("settings.updateOrganization")
    const { orgId: scopeOrgId } = await requireOrgAccess()
    if (scopeOrgId !== orgId) throw new Error(t("actions.organizationSettings.noAccess"))

    const org = await db.organization.findUnique({ where: { id: orgId }, select: { features: true } })
    let features: Record<string, unknown> = {}
    try { const v = JSON.parse(org?.features ?? "{}"); if (v && typeof v === "object") features = v } catch { /* ignore */ }

    const raw = String(formData.get("taxRatePercent") ?? "").trim().replace(",", ".")
    const parsed = parseFloat(raw)
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 20) {
      throw new Error(t("actions.organizationSettings.badTaxRate"))
    }
    features.taxRatePercent = Math.round(parsed * 100) / 100
    const regime = String(formData.get("taxRegime") ?? "").trim()
    if (regime) features.taxRegime = regime.slice(0, 60)

    await db.organization.update({ where: { id: orgId }, data: { features: JSON.stringify(features) } })

    revalidatePath("/admin/settings")
    revalidatePath("/admin/analytics")
    revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
    return { success: true }
  } catch (e) {
    return fail(e, t("actions.organizationSettings.saveFailed"))
  }
}

export async function updatePenaltySettings(orgId: string, formData: FormData) {
  const { t } = await getT()
  try {
    await requireCapabilityAndFeature("settings.updateOrganization")
    const { orgId: scopeOrgId } = await requireOrgAccess()
    if (scopeOrgId !== orgId) throw new Error(t("actions.organizationSettings.noAccess"))

    const rawPercent = String(formData.get("defaultPenaltyPercent") ?? "").trim().replace(",", ".")
    const parsedPercent = parseFloat(rawPercent)
    if (!Number.isFinite(parsedPercent) || parsedPercent < 0 || parsedPercent > 10) {
      throw new Error(t("actions.organizationSettings.badPenalty"))
    }
    const rawGrace = String(formData.get("penaltyGraceDays") ?? "").trim()
    const parsedGrace = parseInt(rawGrace, 10)
    if (!Number.isInteger(parsedGrace) || parsedGrace < 0 || parsedGrace > 60) {
      throw new Error(t("actions.organizationSettings.badGraceDays"))
    }

    await db.organization.update({
      where: { id: orgId },
      data: { defaultPenaltyPercent: Math.round(parsedPercent * 1000) / 1000, penaltyGraceDays: parsedGrace },
    })

    revalidatePath("/admin/settings")
    revalidatePath("/admin/finances")
    revalidateTag(ADMIN_SHELL_CACHE_TAG, { expire: 0 })
    return { success: true }
  } catch (e) {
    return fail(e, t("actions.organizationSettings.saveFailed"))
  }
}

export async function updateOrganizationVat(orgId: string, formData: FormData) {
  const { t } = await getT()
  try {
    await requireCapabilityAndFeature("settings.updateOrganization")
    const { orgId: scopeOrgId } = await requireOrgAccess()
    if (scopeOrgId !== orgId) throw new Error(t("actions.organizationSettings.noAccess"))

    const isVatPayer = formData.get("isVatPayer") === "on"
    const vatNumber = String(formData.get("vatNumber") ?? "").trim()
    const vatRate = normalizeKzVatRate(
      formData.get("vatRate"),
      DEFAULT_KZ_VAT_RATE,
      t("actions.organizationSettings.badVatRate"),
    )

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
    return fail(e, t("actions.organizationSettings.saveFailed"))
  }
}

export async function updateOrganizationRequisites(orgId: string, formData: FormData) {
  const { t } = await getT()
  try {
    await requireCapabilityAndFeature("settings.updateBankDetails")
    const { orgId: scopeOrgId } = await requireOrgAccess()
    if (scopeOrgId !== orgId) throw new Error(t("actions.organizationSettings.noAccess"))

    const legalType = normalizeLegalType(formData.get("legalType"))
  const legalName = requiredText(
    formData.get("legalName"),
    t("actions.organizationSettings.fields.legalName"),
    t,
  )
  const shortName = optionalText(formData.get("shortName"))
  const directorName = requiredText(
    formData.get("directorName"),
    t("actions.organizationSettings.fields.directorName"),
    t,
  )
  const directorPosition = optionalText(formData.get("directorPosition"))
  const basis = requiredText(formData.get("basis"), t("actions.organizationSettings.fields.basis"), t)
  const legalAddress = requiredText(
    formData.get("legalAddress"),
    t("actions.organizationSettings.fields.legalAddress"),
    t,
  )
  const actualAddress = optionalText(formData.get("actualAddress"))
  const bankName = optionalText(formData.get("bankName"))
  const iik = normalizeIik(formData.get("iik"), t)
  const bik = normalizeBik(formData.get("bik"), t)
  const secondBankName = optionalText(formData.get("secondBankName"))
  const secondIik = normalizeIik(formData.get("secondIik"), t)
  const secondBik = normalizeBik(formData.get("secondBik"), t)
  const kbe = optionalText(formData.get("kbe"))
  const knp = optionalText(formData.get("knp"))
  const phone = normalizeKzPhone(formData.get("phone"), {
    fieldName: t("actions.organizationSettings.fields.phone"),
  })
  const email = await normalizeEmailWithDns(formData.get("email"), {
    fieldName: t("actions.organizationSettings.fields.email"),
  })
  // Дефолт пени по договорам. Принимаем "0.5", "0,5", "1" — нормализуем через
  // запятую → точку. Clamp [0, 10] — больше 10% бессмысленно (зеркальный потолок).
  const rawPenalty = String(formData.get("defaultPenaltyPercent") ?? "").trim().replace(",", ".")
  const parsedPenalty = parseFloat(rawPenalty)
  const defaultPenaltyPercent = Number.isFinite(parsedPenalty)
    ? Math.min(Math.max(parsedPenalty, 0), 10)
    : 0.5

  validateOptionalBankAccount(
    bankName,
    iik,
    bik,
    t("actions.organizationSettings.fields.primaryAccount"),
    t,
  )
  validateOptionalBankAccount(
    secondBankName,
    secondIik,
    secondBik,
    t("actions.organizationSettings.fields.secondAccount"),
    t,
  )

  let bin: string | null = null
  let iin: string | null = null
  if (legalType === "IP" || legalType === "PHYSICAL") {
    iin = assertKazakhstanIin(
      formData.get("iin"),
      t("common.settings.identity.iinLabel"),
      iinMessage(t),
    )
  } else if (legalType === "TOO" || legalType === "AO") {
    bin = normalizeBin(formData.get("bin"), true, t)
    iin = normalizeOptionalIin(formData.get("iin"), t("common.settings.identity.iinLabel"), t)
  } else {
    bin = normalizeBin(formData.get("bin"), false, t)
    iin = normalizeOptionalIin(formData.get("iin"), t("common.settings.identity.iinLabel"), t)
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
    return fail(e, t("actions.organizationSettings.saveFailed"))
  }
}

function normalizeLegalType(value: FormDataEntryValue | null) {
  const legalType = String(value ?? "").trim().toUpperCase()
  if (["IP", "TOO", "AO", "PHYSICAL", "OTHER"].includes(legalType)) return legalType
  return "IP"
}

/** Переводчик текущего запроса — помощники ниже сами его не добывают. */
type Tr = Awaited<ReturnType<typeof getT>>["t"]

function requiredText(value: FormDataEntryValue | null, label: string, t: Tr) {
  const text = optionalText(value)
  if (!text) throw new Error(t("actions.organizationSettings.required", { label }))
  return text
}

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ")
  return text.length > 0 ? text : null
}

function normalizeBin(value: FormDataEntryValue | null, required: boolean, t: Tr) {
  const digits = String(value ?? "").replace(/\D/g, "")
  if (!digits) {
    if (required) throw new Error(t("actions.organizationSettings.binDigits"))
    return null
  }
  if (digits.length !== 12 || /^(\d)\1{11}$/.test(digits)) {
    throw new Error(t("actions.organizationSettings.binInvalid"))
  }
  return digits
}

function normalizeOptionalIin(value: FormDataEntryValue | null, label: string, t: Tr) {
  const digits = String(value ?? "").replace(/\D/g, "")
  if (!digits) return null
  return assertKazakhstanIin(digits, label, iinMessage(t))
}

/** Подпись ошибки ИИН: сам модуль проверки языка не знает и отдаёт ключ. */
function iinMessage(t: Tr) {
  return (issue: KzIinIssue | null, label: string) =>
    issue
      ? t(`common.iinChecks.${issue}` as "common.iinChecks.length", { label })
      : t("common.iinChecks.invalid", { label })
}

function normalizeIik(value: FormDataEntryValue | null, t: Tr) {
  const text = String(value ?? "").trim().replace(/\s+/g, "").toUpperCase()
  if (!text) return null
  if (!/^KZ[A-Z0-9]{18}$/.test(text)) {
    throw new Error(t("actions.organizationSettings.iikFormat"))
  }
  return text
}

function normalizeBik(value: FormDataEntryValue | null, t: Tr) {
  const text = String(value ?? "").trim().replace(/\s+/g, "").toUpperCase()
  if (!text) return null
  if (!/^[A-Z0-9]{8,11}$/.test(text)) {
    throw new Error(t("actions.organizationSettings.bikFormat"))
  }
  return text
}

function validateOptionalBankAccount(
  bankName: string | null,
  iik: string | null,
  bik: string | null,
  label: string,
  t: Tr,
) {
  const hasAny = !!bankName || !!iik || !!bik
  if (!hasAny) return
  if (!bankName || !iik || !bik) {
    throw new Error(t("actions.organizationSettings.accountIncomplete", { label }))
  }
}

/**
 * С какого номера продолжать АВР / счета / акты сверки (нумерация из 1С).
 * Это нижняя граница: если в системе уже выставлен номер больше — следующий
 * будет после него (дубли номеров недопустимы для ЭСФ).
 */
export async function updateDocNumberStart(orgId: string, formData: FormData) {
  const { t } = await getT()
  try {
    await requireCapabilityAndFeature("settings.updateOrganization")
    const { orgId: scopeOrgId } = await requireOrgAccess()
    if (scopeOrgId !== orgId) throw new Error(t("actions.organizationSettings.noAccess"))

    const org = await db.organization.findUnique({ where: { id: orgId }, select: { docNumberStart: true } })
    const next: Record<string, number> = { ...((org?.docNumberStart ?? {}) as Record<string, number>) }
    for (const type of ["ACT", "INVOICE", "RECONCILIATION"]) {
      const raw = String(formData.get(type) ?? "").trim()
      if (!raw) { delete next[type]; continue }
      const n = parseInt(raw, 10)
      if (!/^\d+$/.test(raw) || !Number.isInteger(n) || n < 1 || n > 999999) {
        throw new Error(t("actions.organizationSettings.badDocNumber"))
      }
      next[type] = n
    }
    await db.organization.update({ where: { id: orgId }, data: { docNumberStart: next } })
    // Счётчик номеров двигаем сразу: он и выдаёт номера документам.
    for (const [type, n] of Object.entries(next)) {
      await applyDocNumberStart(orgId, type, n)
    }

    revalidatePath("/admin/settings")
    revalidatePath("/admin/documents")
    return { success: true }
  } catch (e) {
    return fail(e, t("actions.organizationSettings.saveFailed"))
  }
}
