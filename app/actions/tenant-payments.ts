"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireSection } from "@/lib/acl"
import { notifyUser } from "@/lib/notify"
import { requireOrgAccess } from "@/lib/org"
import { paymentReportScope, chargeScope } from "@/lib/tenant-scope"
import { getTenantAdminContactsForUser } from "@/lib/tenant-admin-contact"
import { assertTenantBuildingAccess } from "@/lib/building-access"
import { PAYMENT_METHOD_LABELS, formatMoney } from "@/lib/utils"
import { formatTenantPlacement } from "@/lib/tenant-placement"
import {
  PAYMENT_RECEIPT_ALLOWED_MIME_TYPES,
  PAYMENT_RECEIPT_MAX_BYTES,
  getTenantStorageScope,
  storeBufferFile,
} from "@/lib/storage"
import { applyConfirmedPaymentReport } from "@/lib/payment-report-workflow"
import { revalidatePath } from "next/cache"

type ActionResult = {
  ok: boolean
  message?: string
  error?: string
}

const PAYMENT_METHODS = new Set(["TRANSFER", "KASPI", "CASH", "CARD"])

function parsePositiveAmount(value: FormDataEntryValue | null) {
  const amount = Number(String(value ?? "").replace(/\s/g, "").replace(",", "."))
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.round(amount * 100) / 100
}

function parseDate(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim()
  if (!raw) return new Date()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const date = new Date(`${raw}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function parsePaymentMethod(value: FormDataEntryValue | string | null) {
  const method = String(value ?? "").trim().toUpperCase()
  if (!method) return "TRANSFER"
  return PAYMENT_METHODS.has(method) ? method : null
}

async function parseReceipt(fileValue: FormDataEntryValue | null) {
  if (!(fileValue instanceof File) || fileValue.size === 0) return null

  const mime = fileValue.type.trim().toLowerCase()
  if (!PAYMENT_RECEIPT_ALLOWED_MIME_TYPES.has(mime)) {
    return { error: "Чек должен быть PDF, JPG, PNG или WebP" as const }
  }

  if (fileValue.size > PAYMENT_RECEIPT_MAX_BYTES) {
    return { error: "Файл чека не должен быть больше 2 МБ" as const }
  }

  const buffer = Buffer.from(await fileValue.arrayBuffer())
  return {
    name: fileValue.name.slice(0, 160),
    mime,
    buffer,
  }
}

export async function reportTenantPayment(formData: FormData): Promise<ActionResult> {
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }
  if (session.user.role !== "TENANT") return { ok: false, error: "Действие доступно только арендатору" }

  const amount = parsePositiveAmount(formData.get("amount"))
  if (!amount) return { ok: false, error: "Введите корректную сумму оплаты" }

  const paymentDate = parseDate(formData.get("paymentDate"))
  if (!paymentDate) return { ok: false, error: "Введите корректную дату оплаты" }

  const method = parsePaymentMethod(formData.get("method"))
  if (!method) return { ok: false, error: "Выберите корректный способ оплаты" }

  const note = String(formData.get("note") ?? "").trim().slice(0, 500)
  const paymentPurpose = String(formData.get("paymentPurpose") ?? "").trim().slice(0, 300)
  const receipt = await parseReceipt(formData.get("receipt"))
  if (receipt && "error" in receipt) return { ok: false, error: receipt.error }
  const organizationId = session.user.organizationId
  if (!organizationId) return { ok: false, error: "Организация не найдена" }

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      companyName: true,
      space: { select: { number: true, area: true, floor: { select: { name: true } } } },
      tenantSpaces: {
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: { space: { select: { number: true, area: true, floor: { select: { name: true } } } } },
      },
      fullFloors: { select: { name: true } },
      charges: {
        where: { isPaid: false },
        select: { id: true },
        take: 1,
      },
    },
  })
  if (!tenant) return { ok: false, error: "Арендатор не найден" }

  const admins = await getTenantAdminContactsForUser(session.user.id)
  if (admins.length === 0) {
    return { ok: false, error: "Для вашего помещения не назначен администратор. Напишите в поддержку здания." }
  }

  const placement = formatTenantPlacement(tenant, {
    includeFloorName: false,
    emptyLabel: "помещение по договору",
  })
  const formattedDate = paymentDate.toLocaleDateString("ru-RU")
  const methodLabel = PAYMENT_METHOD_LABELS[method] ?? method
  const body = [
    "Здравствуйте. Сообщаю об оплате.",
    "",
    `Арендатор: ${tenant.companyName}`,
    `Помещение: ${placement}`,
    `Сумма: ${formatMoney(amount)}`,
    `Дата оплаты: ${formattedDate}`,
    `Способ оплаты: ${methodLabel}`,
    paymentPurpose ? `Назначение платежа: ${paymentPurpose}` : null,
    note ? `Комментарий: ${note}` : null,
    receipt ? `Чек: ${receipt.name}` : method === "CASH" ? "Чек/расписка: не приложены" : "Чек: не приложен",
    "",
    "Пожалуйста, проверьте поступление и отметьте платеж в системе.",
  ].filter(Boolean).join("\n")

  let storedReceipt: { id: string; url: string } | null = null
  try {
    const storageScope = await getTenantStorageScope(tenant.id)
    if (receipt && !("error" in receipt)) {
      storedReceipt = await storeBufferFile({
        organizationId,
        fileName: receipt.name,
        mimeType: receipt.mime,
        bytes: receipt.buffer,
        ownerType: "PAYMENT_RECEIPT",
        buildingId: storageScope.buildingId,
        tenantId: storageScope.tenantId,
        category: "PAYMENT_RECEIPT",
        visibility: "TENANT_VISIBLE",
        uploadedById: session.user.id,
        maxBytes: PAYMENT_RECEIPT_MAX_BYTES,
        allowedMimeTypes: PAYMENT_RECEIPT_ALLOWED_MIME_TYPES,
      })
    }

    const report = await db.paymentReport.create({
      data: {
        tenantId: tenant.id,
        userId: session.user.id,
        amount,
        paymentDate,
        method,
        paymentPurpose: paymentPurpose || null,
        note: note || null,
        receiptName: receipt && !("error" in receipt) ? receipt.name : null,
        receiptMime: receipt && !("error" in receipt) ? receipt.mime : null,
        receiptDataUrl: null,
        receiptFileId: storedReceipt?.id ?? null,
      },
    })

    if (storedReceipt) {
      await db.storedFile.update({
        where: { id: storedReceipt.id },
        data: { ownerId: report.id },
      })
    }

    await db.message.createMany({
      data: admins.map((admin) => ({
        fromId: session.user.id,
        toId: admin.id,
        subject: "Арендатор сообщил об оплате",
        body: `${body}\n\nЗаявка об оплате: #${report.id}`,
        attachmentUrl: storedReceipt?.url ?? null,
      })),
    })

    for (const admin of admins) {
      await notifyUser({
        userId: admin.id,
        type: "PAYMENT_REPORTED",
        title: `Оплата от ${tenant.companyName}`,
        message: `${formatMoney(amount)} за ${formattedDate}. ${methodLabel}. ${receipt ? "Чек приложен." : "Чек не приложен."}`,
        link: "/admin/finances",
        sendEmail: false,
      })
    }
  } catch (e) {
    if (storedReceipt) {
      await db.storedFile.update({
        where: { id: storedReceipt.id },
        data: { deletedAt: new Date() },
      }).catch(() => null)
    }
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось сохранить чек" }
  }

  revalidatePath("/cabinet/finances")
  revalidatePath("/cabinet/messages")
  revalidatePath("/admin/messages")
  revalidatePath("/admin/finances")
  revalidatePath(`/admin/tenants/${tenant.id}`)

  return { ok: true, message: "Администратор получил уведомление об оплате" }
}

export async function confirmPaymentReport(formData: FormData): Promise<ActionResult> {
  await requireSection("finances", "edit")
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }
  const { orgId } = await requireOrgAccess()

  const reportId = String(formData.get("reportId") ?? "").trim()
  if (!reportId) return { ok: false, error: "Не указана заявка об оплате" }

  const cashAccountId = String(formData.get("cashAccountId") ?? "").trim() || null
  const requestedMethod = String(formData.get("method") ?? "").trim()
  const chargeIds = formData.getAll("chargeIds").map((value) => String(value)).filter(Boolean)

  const report = await db.paymentReport.findFirst({
    where: { id: reportId, status: { in: ["PENDING", "DISPUTED"] }, ...paymentReportScope(orgId) },
    select: {
      id: true,
      tenantId: true,
      amount: true,
      paymentDate: true,
      method: true,
      note: true,
      paymentPurpose: true,
      tenant: { select: { companyName: true } },
    },
  })
  if (!report) return { ok: false, error: "Заявка об оплате не найдена или уже обработана" }

  await assertTenantBuildingAccess(report.tenantId, orgId)

  const method = parsePaymentMethod(requestedMethod || report.method)
  if (!method) return { ok: false, error: "Выберите корректный способ оплаты" }

  if (cashAccountId) {
    const account = await db.cashAccount.findFirst({
      where: { id: cashAccountId, organizationId: orgId, isActive: true },
      select: { id: true },
    })
    if (!account) return { ok: false, error: "Указан недоступный счет зачисления" }
  }

  let validChargeIds: string[] = []
  let selectedChargesTotal = 0
  if (chargeIds.length > 0) {
    const validCharges = await db.charge.findMany({
      where: {
        AND: [
          chargeScope(orgId),
          { id: { in: chargeIds }, tenantId: report.tenantId },
        ],
      },
      select: { id: true, amount: true },
    })
    validChargeIds = validCharges.map((charge) => charge.id)
    selectedChargesTotal = Math.round(validCharges.reduce((sum, charge) => sum + charge.amount, 0) * 100) / 100
    if (validChargeIds.length !== chargeIds.length) {
      return { ok: false, error: "Некоторые начисления недоступны для текущей организации" }
    }
  }

  if (chargeIds.length > 0) {
    if (selectedChargesTotal > report.amount + 0.01) {
      return {
        ok: false,
        error: `Нельзя закрыть начисления на ${formatMoney(selectedChargesTotal)} платежом ${formatMoney(report.amount)}. Снимите лишние начисления или уточните сумму оплаты.`,
      }
    }
  }

  const result = await db.$transaction(async (tx) => {
    return applyConfirmedPaymentReport(tx, {
      report,
      method,
      reviewerId: session.user.id,
      cashAccountId,
      chargeIds: validChargeIds,
    })
  })

  const tenant = await db.tenant.findUnique({
    where: { id: report.tenantId },
    select: { userId: true },
  })
  if (tenant?.userId) {
    await notifyUser({
      userId: tenant.userId,
      type: "PAYMENT_CONFIRMED",
      title: "Оплата подтверждена",
      message: `Администратор провел платеж ${formatMoney(report.amount)}.`,
      link: "/cabinet/finances",
      sendEmail: false,
    })
  }

  revalidatePath("/admin/finances")
  revalidatePath("/admin/finances/balance")
  revalidatePath("/cabinet/finances")
  revalidatePath(`/admin/tenants/${report.tenantId}`)

  const closedText = validChargeIds.length > 0
    ? ` Закрыто начислений: ${validChargeIds.length} на ${formatMoney(selectedChargesTotal)}.`
    : ""
  return { ok: true, message: `Платеж проведен: ${formatMoney(result.amount)}.${closedText}` }
}

export async function markPaymentReportDisputed(formData: FormData): Promise<ActionResult> {
  await requireSection("finances", "edit")
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }
  const { orgId } = await requireOrgAccess()

  const reportId = String(formData.get("reportId") ?? "").trim()
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500)
  if (!reportId) return { ok: false, error: "Не указана заявка об оплате" }
  if (reason.length < 5) return { ok: false, error: "Коротко укажите, что нужно уточнить по оплате" }

  const report = await db.paymentReport.findFirst({
    where: { id: reportId, status: { in: ["PENDING", "DISPUTED"] }, ...paymentReportScope(orgId) },
    select: { id: true, tenantId: true, amount: true, userId: true, note: true },
  })
  if (!report) return { ok: false, error: "Заявка об оплате не найдена или уже обработана" }

  await assertTenantBuildingAccess(report.tenantId, orgId)

  await db.paymentReport.update({
    where: { id: report.id },
    data: {
      status: "DISPUTED",
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      note: [report.note, `Спорная оплата: ${reason}`].filter(Boolean).join("\n\n"),
    },
  })

  await notifyUser({
    userId: report.userId,
    type: "PAYMENT_DISPUTED",
    title: "Оплата требует уточнения",
    message: reason || `Администратор уточняет платеж ${formatMoney(report.amount)}.`,
    link: "/cabinet/finances",
    sendEmail: false,
  })

  revalidatePath("/admin/finances")
  revalidatePath("/cabinet/finances")
  return { ok: true, message: "Оплата помечена как спорная" }
}

export async function rejectPaymentReport(formData: FormData): Promise<ActionResult> {
  await requireSection("finances", "edit")
  const session = await auth()
  if (!session?.user) return { ok: false, error: "Не авторизован" }
  const { orgId } = await requireOrgAccess()

  const reportId = String(formData.get("reportId") ?? "").trim()
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300)
  if (!reportId) return { ok: false, error: "Не указана заявка об оплате" }

  const report = await db.paymentReport.findFirst({
    where: { id: reportId, status: { in: ["PENDING", "DISPUTED"] }, ...paymentReportScope(orgId) },
    select: { id: true, tenantId: true, amount: true, userId: true, note: true },
  })
  if (!report) return { ok: false, error: "Заявка об оплате не найдена или уже обработана" }

  await assertTenantBuildingAccess(report.tenantId, orgId)

  await db.paymentReport.update({
    where: { id: report.id },
    data: {
      status: "REJECTED",
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      note: reason
        ? [report.note, `Отклонено: ${reason}`].filter(Boolean).join("\n\n")
        : report.note,
    },
  })

  await notifyUser({
    userId: report.userId,
    type: "PAYMENT_REJECTED",
    title: "Оплата требует уточнения",
    message: reason || `Администратор не смог подтвердить платеж ${formatMoney(report.amount)}.`,
    link: "/cabinet/finances",
    sendEmail: false,
  })

  revalidatePath("/admin/finances")
  revalidatePath("/cabinet/finances")
  return { ok: true, message: "Заявка об оплате отклонена" }
}
