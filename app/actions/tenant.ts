"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { requireOrgAccess } from "@/lib/org"
import { assertBuildingAccess, assertTenantBuildingAccess } from "@/lib/building-access"
import { requireSection } from "@/lib/acl"
import {
  assertTenantInOrg,
  assertSpaceInOrg,
  assertUserInOrg,
} from "@/lib/scope-guards"
import { normalizeEmailWithDns, normalizeKzPhone } from "@/lib/contact-validation"
import { isContractNumberUnique, suggestContractNumber } from "@/lib/contract-numbering"
import { normalizeTenantRentChoice } from "@/lib/rent"
import { getTenantPrimaryBuildingId } from "@/lib/tenant-placement"
import { normalizeTenantLegalType, normalizeTenantTaxIds } from "@/lib/tenant-identity"
import { normalizeIik, validateRequisites } from "@/lib/kz-validators"

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

function positiveAmount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null
}

function normalizeOptionalText(value: FormDataEntryValue | null, max = 120) {
  const text = String(value ?? "").trim()
  return text ? text.slice(0, max) : null
}

function hasBankAccountInput(formData: FormData) {
  return ["bankName", "iik", "bik", "label"].some((key) => String(formData.get(key) ?? "").trim())
}

function normalizeTenantBankAccountInput(formData: FormData) {
  const label = normalizeOptionalText(formData.get("label"), 80)
  const bankName = normalizeOptionalText(formData.get("bankName"), 160)
  const iik = normalizeIik(String(formData.get("iik") ?? ""))
  const bik = String(formData.get("bik") ?? "").trim().replace(/\s+/g, "").toUpperCase()

  if (!bankName) throw new Error("Укажите название банка")
  if (!iik) throw new Error("Укажите ИИК")
  if (!bik) throw new Error("Укажите БИК")

  const checks = validateRequisites({ bik, iik })
  if (checks.bik && !checks.bik.ok) throw new Error(checks.bik.warning ?? "Некорректный БИК")
  if (checks.iik && !checks.iik.ok) throw new Error(checks.iik.warning ?? "Некорректный ИИК")
  if (checks.consistency && !checks.consistency.ok) {
    throw new Error(checks.consistency.warning ?? "ИИК не соответствует БИК")
  }

  return { label, bankName, iik, bik }
}

async function syncTenantPrimaryBankAccount(
  tx: Pick<typeof db, "tenantBankAccount" | "tenant">,
  tenantId: string,
) {
  const account = await tx.tenantBankAccount.findFirst({
    where: { tenantId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { id: true, bankName: true, iik: true, bik: true, isPrimary: true },
  })

  if (!account) {
    await tx.tenant.update({
      where: { id: tenantId },
      data: { bankName: null, iik: null, bik: null },
    })
    return
  }

  if (!account.isPrimary) {
    await tx.tenantBankAccount.update({
      where: { id: account.id },
      data: { isPrimary: true },
    })
  }

  await tx.tenant.update({
    where: { id: tenantId },
    data: {
      bankName: account.bankName,
      iik: account.iik,
      bik: account.bik,
    },
  })
}

type RentalTermsSnapshot = {
  customRate: number | null
  fixedMonthlyRent: number | null
  cleaningFee: number
  needsCleaning: boolean
  paymentDueDay: number
  penaltyPercent: number
  isVatPayer: boolean
}

const RENTAL_TERM_FIELDS: Array<keyof RentalTermsSnapshot> = [
  "customRate",
  "fixedMonthlyRent",
  "cleaningFee",
  "needsCleaning",
  "paymentDueDay",
  "penaltyPercent",
  "isVatPayer",
]

const RENTAL_TERM_LABELS: Record<keyof RentalTermsSnapshot, string> = {
  customRate: "Индивидуальная ставка",
  fixedMonthlyRent: "Индивидуальная аренда",
  cleaningFee: "Уборка",
  needsCleaning: "Требуется уборка",
  paymentDueDay: "День оплаты",
  penaltyPercent: "Пеня",
  isVatPayer: "Плательщик НДС",
}

function normalizeMoney(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return Math.round(value * 100) / 100
}

function normalizePercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return Math.round(value * 1000) / 1000
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value)
}

function formatRentalTermValue(field: keyof RentalTermsSnapshot, value: RentalTermsSnapshot[keyof RentalTermsSnapshot]) {
  if (field === "customRate") return value === null ? "не указана" : `${formatAmount(value as number)} ₸/м²`
  if (field === "fixedMonthlyRent") return value === null ? "не указана" : `${formatAmount(value as number)} ₸/мес`
  if (field === "cleaningFee") return `${formatAmount(value as number)} ₸/мес`
  if (field === "needsCleaning" || field === "isVatPayer") return value ? "да" : "нет"
  if (field === "paymentDueDay") return `${value} число`
  if (field === "penaltyPercent") return `${formatAmount(value as number)}% в день`
  return String(value ?? "")
}

function rentalTermsChanged(before: RentalTermsSnapshot, after: RentalTermsSnapshot) {
  return RENTAL_TERM_FIELDS.some((field) => before[field] !== after[field])
}

function changedRentalTermLines(before: RentalTermsSnapshot, after: RentalTermsSnapshot) {
  return RENTAL_TERM_FIELDS
    .filter((field) => before[field] !== after[field])
    .map((field) => {
      const label = RENTAL_TERM_LABELS[field]
      const oldValue = formatRentalTermValue(field, before[field])
      const newValue = formatRentalTermValue(field, after[field])
      return `- ${label}: было ${oldValue}; стало ${newValue}`
    })
}

function parseDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function buildRentalTermsAddendumContent(args: {
  number: string
  date: Date
  tenantName: string
  changes: string
  before: RentalTermsSnapshot
  after: RentalTermsSnapshot
  lockReason: string
}) {
  const changedLines = changedRentalTermLines(args.before, args.after)
  return [
    `Дополнительное соглашение № ${args.number}`,
    `к договору аренды арендатора ${args.tenantName}`,
    `Дата: ${args.date.toLocaleDateString("ru-RU")}`,
    "",
    "Основание блокировки условий:",
    args.lockReason,
    "",
    "Согласованные изменения:",
    args.changes,
    "",
    "Изменяемые условия:",
    ...(changedLines.length > 0 ? changedLines : ["- Изменения не указаны"]),
    "",
    "Прочие условия договора аренды остаются без изменений.",
  ].join("\n")
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
  await assertTenantBuildingAccess(tenantId, orgId)

  const companyName = formData.get("companyName") as string
  const bankName = formData.get("bankName") as string
  const iik = formData.get("iik") as string
  const bik = formData.get("bik") as string
  const legalType = normalizeTenantLegalType(formData.get("legalType"))
  const taxIds = normalizeTenantTaxIds({
    legalType,
    bin: formData.get("bin"),
    iin: formData.get("iin"),
  })
  const category = formData.get("category") as string
  const legalAddress = formData.get("legalAddress") as string
  const actualAddress = formData.get("actualAddress") as string
  const directorName = formData.get("directorName") as string
  const directorPosition = formData.get("directorPosition") as string
  const rentChoice = normalizeTenantRentChoice({
    rentMode: String(formData.get("rentMode") ?? "").trim() || null,
    customRate: parsePositiveNumberOrNull(formData.get("customRate")),
    fixedMonthlyRent: parsePositiveNumberOrNull(formData.get("fixedMonthlyRent")),
  })
  const cleaningFeeStr = formData.get("cleaningFee") as string
  const needsCleaning = formData.get("needsCleaning") === "on"
  const contractStart = formData.get("contractStart") as string
  const contractEnd = formData.get("contractEnd") as string

  await db.tenant.update({
    where: { id: tenantId },
    data: {
      companyName,
      bin: taxIds.bin,
      iin: taxIds.iin,
      bankName: bankName || null,
      iik: iik || null,
      bik: bik || null,
      legalType: taxIds.legalType,
      category: category || null,
      legalAddress: legalAddress || null,
      actualAddress: actualAddress || null,
      directorName: directorName || null,
      directorPosition: directorPosition || null,
      customRate: rentChoice.customRate,
      fixedMonthlyRent: rentChoice.fixedMonthlyRent,
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
  await assertTenantBuildingAccess(tenantId, orgId)

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { legalType: true },
  })
  if (!tenant) throw new Error("Арендатор не найден")
  const taxIds = normalizeTenantTaxIds({
    legalType: tenant.legalType,
    bin: formData.get("bin"),
    iin: formData.get("iin"),
  })

  const shouldUpdateBank = hasBankAccountInput(formData)
  const accountInput = shouldUpdateBank ? normalizeTenantBankAccountInput(formData) : null
  if (accountInput) {
    const duplicateSecondary = await db.tenantBankAccount.findFirst({
      where: { tenantId, iik: accountInput.iik, isPrimary: false },
      select: { id: true },
    })
    if (duplicateSecondary) throw new Error("Такой ИИК уже добавлен этому арендатору")
  }

  await db.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        bin: taxIds.bin,
        iin: taxIds.iin,
      },
    })

    if (accountInput) {
      const existingPrimary = await tx.tenantBankAccount.findFirst({
        where: { tenantId, isPrimary: true },
        select: { id: true },
      })

      if (existingPrimary) {
        await tx.tenantBankAccount.update({
          where: { id: existingPrimary.id },
          data: { ...accountInput, isPrimary: true },
        })
        await tx.tenantBankAccount.updateMany({
          where: {
            tenantId,
            isPrimary: true,
            id: { not: existingPrimary.id },
          },
          data: { isPrimary: false },
        })
      } else {
        await tx.tenantBankAccount.updateMany({
          where: { tenantId },
          data: { isPrimary: false },
        })
        await tx.tenantBankAccount.create({
          data: { tenantId, ...accountInput, isPrimary: true },
        })
      }
    }

    await syncTenantPrimaryBankAccount(tx, tenantId)
  })

  revalidatePath(`/admin/tenants/${tenantId}`)
  return { success: true }
}

export async function createTenantBankAccount(tenantId: string, formData: FormData) {
  const { orgId } = await requireOrgAccess()
  await assertTenantInOrg(tenantId, orgId)
  await assertTenantBuildingAccess(tenantId, orgId)

  const accountInput = normalizeTenantBankAccountInput(formData)
  const existing = await db.tenantBankAccount.findFirst({
    where: { tenantId, iik: accountInput.iik },
    select: { id: true },
  })
  if (existing) throw new Error("Такой ИИК уже добавлен этому арендатору")

  await db.$transaction(async (tx) => {
    const count = await tx.tenantBankAccount.count({ where: { tenantId } })
    const makePrimary = formData.get("isPrimary") === "on" || count === 0
    if (makePrimary) {
      await tx.tenantBankAccount.updateMany({
        where: { tenantId },
        data: { isPrimary: false },
      })
    }

    await tx.tenantBankAccount.create({
      data: { tenantId, ...accountInput, isPrimary: makePrimary },
    })

    await syncTenantPrimaryBankAccount(tx, tenantId)
  })

  revalidatePath(`/admin/tenants/${tenantId}`)
  return { success: true }
}

export async function updateTenantBankAccount(accountId: string, formData: FormData) {
  const { orgId } = await requireOrgAccess()
  const account = await db.tenantBankAccount.findUnique({
    where: { id: accountId },
    select: { tenantId: true },
  })
  if (!account) throw new Error("Счёт не найден")
  await assertTenantInOrg(account.tenantId, orgId)
  await assertTenantBuildingAccess(account.tenantId, orgId)

  const accountInput = normalizeTenantBankAccountInput(formData)
  const duplicate = await db.tenantBankAccount.findFirst({
    where: { tenantId: account.tenantId, iik: accountInput.iik, id: { not: accountId } },
    select: { id: true },
  })
  if (duplicate) throw new Error("Такой ИИК уже добавлен этому арендатору")

  await db.$transaction(async (tx) => {
    await tx.tenantBankAccount.update({
      where: { id: accountId },
      data: accountInput,
    })
    await syncTenantPrimaryBankAccount(tx, account.tenantId)
  })

  revalidatePath(`/admin/tenants/${account.tenantId}`)
  return { success: true }
}

export async function setPrimaryTenantBankAccount(accountId: string) {
  const { orgId } = await requireOrgAccess()
  const account = await db.tenantBankAccount.findUnique({
    where: { id: accountId },
    select: { tenantId: true },
  })
  if (!account) throw new Error("Счёт не найден")
  await assertTenantInOrg(account.tenantId, orgId)
  await assertTenantBuildingAccess(account.tenantId, orgId)

  await db.$transaction(async (tx) => {
    await tx.tenantBankAccount.updateMany({
      where: { tenantId: account.tenantId },
      data: { isPrimary: false },
    })
    await tx.tenantBankAccount.update({
      where: { id: accountId },
      data: { isPrimary: true },
    })
    await syncTenantPrimaryBankAccount(tx, account.tenantId)
  })

  revalidatePath(`/admin/tenants/${account.tenantId}`)
  return { success: true }
}

export async function deleteTenantBankAccount(accountId: string) {
  const { orgId } = await requireOrgAccess()
  const account = await db.tenantBankAccount.findUnique({
    where: { id: accountId },
    select: { tenantId: true },
  })
  if (!account) throw new Error("Счёт не найден")
  await assertTenantInOrg(account.tenantId, orgId)
  await assertTenantBuildingAccess(account.tenantId, orgId)

  await db.$transaction(async (tx) => {
    await tx.tenantBankAccount.delete({ where: { id: accountId } })
    await syncTenantPrimaryBankAccount(tx, account.tenantId)
  })

  revalidatePath(`/admin/tenants/${account.tenantId}`)
  return { success: true }
}

export async function updateTenantRentalTerms(tenantId: string, formData: FormData) {
  await requireSection("tenants", "edit")
  const { orgId } = await requireOrgAccess()
  await assertTenantInOrg(tenantId, orgId)
  await assertTenantBuildingAccess(tenantId, orgId)

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      companyName: true,
      customRate: true,
      fixedMonthlyRent: true,
      cleaningFee: true,
      needsCleaning: true,
      paymentDueDay: true,
      penaltyPercent: true,
      isVatPayer: true,
      space: { select: { floor: { select: { buildingId: true } } } },
      fullFloors: {
        select: { id: true, name: true, fixedMonthlyRent: true, buildingId: true },
      },
    },
  })
  if (!tenant) throw new Error("Арендатор не найден")

  const rentChoice = normalizeTenantRentChoice({
    rentMode: String(formData.get("rentMode") ?? "").trim() || null,
    customRate: parsePositiveNumberOrNull(formData.get("customRate")),
    fixedMonthlyRent: parsePositiveNumberOrNull(formData.get("fixedMonthlyRent")),
    requireValueForMode: !!formData.get("rentMode"),
  })
  const cleaningFee = parseNumberOrNull(formData.get("cleaningFee")) ?? tenant.cleaningFee ?? 0
  const needsCleaning = formData.get("needsCleaning") === "on"
  const paymentDueDayStr = String(formData.get("paymentDueDay") ?? "")
  const penaltyPercentStr = String(formData.get("penaltyPercent") ?? "")
  const isVatPayer = formData.get("isVatPayer") === "on"

  let paymentDueDay = tenant.paymentDueDay ?? 10
  if (paymentDueDayStr) {
    const n = parseInt(paymentDueDayStr, 10)
    if (isFinite(n) && n >= 1 && n <= 31) paymentDueDay = n
  }

  let penaltyPercent = tenant.penaltyPercent ?? 1
  if (penaltyPercentStr) {
    const n = parseFloat(penaltyPercentStr.replace(",", "."))
    if (isFinite(n) && n >= 0 && n <= 100) penaltyPercent = n
  }

  const before: RentalTermsSnapshot = {
    customRate: normalizeMoney(tenant.customRate),
    fixedMonthlyRent: normalizeMoney(tenant.fixedMonthlyRent),
    cleaningFee: normalizeMoney(tenant.cleaningFee) ?? 0,
    needsCleaning: tenant.needsCleaning,
    paymentDueDay: tenant.paymentDueDay ?? 10,
    penaltyPercent: normalizePercent(tenant.penaltyPercent),
    isVatPayer: tenant.isVatPayer,
  }

  const after: RentalTermsSnapshot = {
    customRate: normalizeMoney(rentChoice.customRate),
    fixedMonthlyRent: normalizeMoney(rentChoice.fixedMonthlyRent),
    cleaningFee: normalizeMoney(cleaningFee) ?? 0,
    needsCleaning,
    paymentDueDay,
    penaltyPercent: normalizePercent(penaltyPercent),
    isVatPayer,
  }

  const fullFloorsWithFixedRent = tenant.fullFloors.filter((floor) => positiveAmount(floor.fixedMonthlyRent) !== null)
  const fullFloorRentTotal = fullFloorsWithFixedRent.reduce((sum, floor) => sum + (positiveAmount(floor.fixedMonthlyRent) ?? 0), 0)
  const tenantFixedRent = positiveAmount(tenant.fixedMonthlyRent)
  const tenantCustomRate = positiveAmount(tenant.customRate)
  const rentalTermsLocked = fullFloorsWithFixedRent.length > 0 || tenantFixedRent !== null || tenantCustomRate !== null
  const lockReason = fullFloorsWithFixedRent.length > 0
    ? `У арендатора указана стоимость за этажи ${fullFloorsWithFixedRent.map((floor) => floor.name).join(", ")}: ${formatAmount(fullFloorRentTotal)} ₸/мес.`
    : tenantFixedRent !== null
      ? `У арендатора указана индивидуальная сумма аренды: ${formatAmount(tenantFixedRent)} ₸/мес.`
      : tenantCustomRate !== null
        ? `У арендатора указана индивидуальная ставка аренды: ${formatAmount(tenantCustomRate)} ₸/м².`
        : ""
  const changed = rentalTermsChanged(before, after)

  let addendum: { number: string; date: Date; changes: string; content: string } | null = null
  if (rentalTermsLocked && changed) {
    const addendumNumber = String(formData.get("addendumNumber") ?? "").trim()
    const addendumDateRaw = String(formData.get("addendumDate") ?? "").trim()
    const addendumDate = parseDateInput(addendumDateRaw)
    const addendumChanges = String(formData.get("addendumChanges") ?? "").trim()

    if (!addendumNumber) throw new Error("Укажите номер дополнительного соглашения")
    if (addendumNumber.length > 80) throw new Error("Номер дополнительного соглашения должен быть до 80 символов")
    if (!addendumDate) throw new Error("Укажите дату дополнительного соглашения")
    if (addendumChanges.length < 10) throw new Error("Опишите изменения в дополнительном соглашении минимум в 10 символов")
    if (addendumChanges.length > 2000) throw new Error("Описание изменений должно быть до 2000 символов")

    const buildingId = getTenantPrimaryBuildingId(tenant)
    if (!buildingId) throw new Error("Арендатор не привязан к помещению или этажу, поэтому нельзя оформить дополнительное соглашение")

    const unique = await isContractNumberUnique(buildingId, addendumNumber)
    if (!unique) {
      const suggested = await suggestContractNumber(buildingId)
      throw new Error(`Номер «${addendumNumber}» уже используется в этом здании. Можно взять следующий номер: ${suggested}`)
    }

    addendum = {
      number: addendumNumber,
      date: addendumDate,
      changes: addendumChanges,
      content: buildRentalTermsAddendumContent({
        number: addendumNumber,
        date: addendumDate,
        tenantName: tenant.companyName,
        changes: addendumChanges,
        before,
        after,
        lockReason,
      }),
    }
  }

  await db.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        customRate: after.customRate,
        fixedMonthlyRent: after.fixedMonthlyRent,
        cleaningFee: after.cleaningFee,
        needsCleaning: after.needsCleaning,
        paymentDueDay: after.paymentDueDay,
        penaltyPercent: after.penaltyPercent,
        isVatPayer: after.isVatPayer,
      },
    })

    if (addendum) {
      await tx.contract.create({
        data: {
          tenantId,
          number: addendum.number,
          type: "ADDENDUM",
          content: addendum.content,
          startDate: addendum.date,
          status: "DRAFT",
        },
      })
    }
  })

  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath("/admin/contracts")
  return { success: true, addendumCreated: !!addendum }
}

export async function updateTenantUser(userId: string, tenantId: string, formData: FormData) {
  const { orgId } = await requireOrgAccess()
  await assertTenantInOrg(tenantId, orgId)
  await assertTenantBuildingAccess(tenantId, orgId)
  await assertUserInOrg(userId, orgId)

  const name = String(formData.get("name") ?? "").trim()
  const phone = normalizeKzPhone(formData.get("phone"))
  const email = await normalizeEmailWithDns(formData.get("email"))

  if (!name) throw new Error("Введите ФИО контактного лица")

  if (phone) {
    const existing = await db.user.findFirst({
      where: { phone, id: { not: userId } },
      select: { id: true },
    })
    if (existing) throw new Error(`Телефон ${phone} уже используется другим пользователем`)
  }

  if (email) {
    const existing = await db.user.findFirst({
      where: { email, id: { not: userId } },
      select: { id: true },
    })
    if (existing) throw new Error(`Email ${email} уже используется другим пользователем`)
  }

  await db.user.update({
    where: { id: userId },
    data: {
      name,
      phone,
      email,
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
    tenantSpacesCount,
    spaceLink,
  ] = await Promise.all([
    db.charge.count({ where: { tenantId } }),
    db.payment.count({ where: { tenantId } }),
    db.contract.count({ where: { tenantId } }),
    db.tenantDocument.count({ where: { tenantId } }),
    db.request.count({ where: { tenantId } }),
    db.floor.count({ where: { fullFloorTenantId: tenantId } }),
    db.tenantSpace.count({ where: { tenantId } }),
    db.tenant.findUnique({ where: { id: tenantId }, select: { spaceId: true } }),
  ])

  return {
    charges: chargesCount,
    payments: paymentsCount,
    contracts: contractsCount,
    documents: documentsCount,
    requests: requestsCount,
    fullFloors: fullFloorsCount,
    hasSpace: !!spaceLink?.spaceId || tenantSpacesCount > 0,
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
    select: {
      id: true,
      userId: true,
      spaceId: true,
      companyName: true,
      tenantSpaces: { select: { spaceId: true } },
    },
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
  const spaceIdsToVacate = [...new Set([
    tenant.spaceId,
    ...tenant.tenantSpaces.map((item) => item.spaceId),
  ].filter(Boolean) as string[])]

  await db.$transaction([
    // Освобождаем помещения
    ...(spaceIdsToVacate.length > 0
      ? [db.space.updateMany({ where: { id: { in: spaceIdsToVacate } }, data: { status: "VACANT" } })]
      : []),
    db.tenantSpace.deleteMany({ where: { tenantId } }),
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

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      spaceId: true,
      companyName: true,
      tenantSpaces: {
        select: {
          spaceId: true,
          isPrimary: true,
          space: {
            select: {
              floor: {
                select: {
                  buildingId: true,
                  building: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      space: {
        select: {
          floor: {
            select: {
              buildingId: true,
              building: { select: { name: true } },
            },
          },
        },
      },
      fullFloors: {
        select: {
          buildingId: true,
          building: { select: { name: true } },
        },
      },
    },
  })
  if (!tenant) throw new Error("Арендатор не найден")

  if (spaceId) {
    // Помещение должно быть на не-полностью-арендованном этаже
    const { assertSpaceAssignable } = await import("@/lib/full-floor-guards")
    await assertSpaceAssignable(spaceId)
    // И не должно быть уже занято другим
    const target = await db.space.findUnique({
      where: { id: spaceId },
      select: {
        number: true,
        floor: {
          select: {
            buildingId: true,
            building: { select: { name: true } },
          },
        },
        tenant: { select: { companyName: true, id: true } },
        tenantSpaces: {
          select: {
            tenant: { select: { companyName: true, id: true } },
          },
        },
      },
    })
    if (target?.floor.buildingId) await assertBuildingAccess(target.floor.buildingId, orgId)
    const tenantBuildings = [
      ...tenant.tenantSpaces.map((item) => item.space.floor),
      tenant.space?.floor,
      ...tenant.fullFloors,
    ].filter((building): building is NonNullable<typeof tenant.space>["floor"] => building !== null && building !== undefined)
    const tenantBuilding = target
      ? tenantBuildings.find((building) => building.buildingId !== target.floor.buildingId) ?? null
      : null
    if (target && tenantBuilding) {
      throw new Error(
        `Арендатор «${tenant.companyName}» относится к зданию «${tenantBuilding.building.name}», ` +
          `а Каб. ${target.number} находится в здании «${target.floor.building.name}». ` +
          "Переключитесь на нужное здание или выберите помещение в том же здании.",
      )
    }
    const occupiedBy = target?.tenantSpaces[0]?.tenant ?? target?.tenant ?? null
    if (occupiedBy && occupiedBy.id !== tenantId) {
      throw new Error(
        `Кабинет ${target?.number ?? "—"} уже занят арендатором «${occupiedBy.companyName}». Сначала выселите.`,
      )
    }
  }

  // Атомарно: добавляем помещение к арендатору. Старые помещения не снимаем.
  // Если что-то упадёт — БД останется в консистентном состоянии.
  await db.$transaction(async (tx) => {
    if (!spaceId) {
      const assignedSpaceIds = tenant.tenantSpaces.map((item) => item.spaceId)
      await tx.tenantSpace.deleteMany({ where: { tenantId } })
      if (assignedSpaceIds.length > 0) {
        await tx.space.updateMany({
          where: { id: { in: assignedSpaceIds } },
          data: { status: "VACANT" },
        })
      }
      await tx.tenant.update({ where: { id: tenantId }, data: { spaceId: null } })
      return
    }

    const hasPrimary = tenant.tenantSpaces.some((item) => item.isPrimary) || !!tenant.spaceId
    await tx.tenantSpace.upsert({
      where: { tenantId_spaceId: { tenantId, spaceId } },
      update: {},
      create: { tenantId, spaceId, isPrimary: !hasPrimary },
    })
    await tx.space.update({ where: { id: spaceId }, data: { status: "OCCUPIED" } })
    if (!tenant.spaceId) {
      await tx.tenant.update({ where: { id: tenantId }, data: { spaceId } })
    }
  })

  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath("/admin/tenants")
  revalidatePath("/admin/spaces")
  return { success: true }
}

export async function unassignTenantSpace(tenantId: string, spaceId: string) {
  const { orgId } = await requireOrgAccess()
  await assertTenantInOrg(tenantId, orgId)
  await assertTenantBuildingAccess(tenantId, orgId)
  await assertSpaceInOrg(spaceId, orgId)

  const tenant = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      spaceId: true,
      tenantSpaces: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: { spaceId: true, isPrimary: true },
      },
    },
  })
  if (!tenant) throw new Error("Арендатор не найден")
  if (!tenant.tenantSpaces.some((item) => item.spaceId === spaceId)) {
    throw new Error("Это помещение не привязано к арендатору")
  }

  const remaining = tenant.tenantSpaces.filter((item) => item.spaceId !== spaceId)
  const nextPrimarySpaceId = remaining[0]?.spaceId ?? null

  await db.$transaction(async (tx) => {
    await tx.tenantSpace.delete({
      where: { tenantId_spaceId: { tenantId, spaceId } },
    })
    await tx.space.update({ where: { id: spaceId }, data: { status: "VACANT" } })

    if (nextPrimarySpaceId) {
      await tx.tenantSpace.updateMany({
        where: { tenantId },
        data: { isPrimary: false },
      })
      await tx.tenantSpace.update({
        where: { tenantId_spaceId: { tenantId, spaceId: nextPrimarySpaceId } },
        data: { isPrimary: true },
      })
    }

    if (tenant.spaceId === spaceId || !tenant.spaceId) {
      await tx.tenant.update({
        where: { id: tenantId },
        data: { spaceId: nextPrimarySpaceId },
      })
    }
  })

  revalidatePath(`/admin/tenants/${tenantId}`)
  revalidatePath("/admin/tenants")
  revalidatePath("/admin/spaces")
  return { success: true }
}
