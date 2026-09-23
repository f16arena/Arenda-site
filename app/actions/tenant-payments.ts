"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireCapabilityAndFeature } from "@/lib/capabilities"
import { notifyUser } from "@/lib/notify"
import { getT, getTForUser } from "@/lib/i18n/server"
import { formatDateShortL, formatMoneyL } from "@/lib/i18n/format"
import { requireOrgAccess } from "@/lib/org"
import { paymentReportScope, chargeScope } from "@/lib/tenant-scope"
import { getTenantAdminContactsForUser } from "@/lib/tenant-admin-contact"
import { assertTenantBuildingAccess } from "@/lib/building-access"
import { formatTenantPlacement } from "@/lib/tenant-placement"
import {
  PAYMENT_RECEIPT_ALLOWED_MIME_TYPES,
  PAYMENT_RECEIPT_MAX_BYTES,
  getTenantStorageScope,
  storeBufferFile,
} from "@/lib/storage"
import { applyConfirmedPaymentReport } from "@/lib/payment-report-workflow"
import { actionErrorResult } from "@/lib/action-error"
import { revalidatePath } from "next/cache"

type ActionResult = {
  ok: boolean
  message?: string
  error?: string
}

// Next.js redirect()/notFound() бросают служебные «ошибки» с digest — в catch их
// нельзя глотать, иначе сломается переход. Пробрасываем дальше.
function isNextControlFlowError(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest
  return typeof digest === "string" && (digest === "NEXT_NOT_FOUND" || digest.startsWith("NEXT_REDIRECT"))
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

// Переводчик приходит параметром: помощник сам его не добывает.
type Tr = Awaited<ReturnType<typeof getT>>["t"]

async function parseReceipt(fileValue: FormDataEntryValue | null, t: Tr) {
  if (!(fileValue instanceof File) || fileValue.size === 0) return null

  const mime = fileValue.type.trim().toLowerCase()
  if (!PAYMENT_RECEIPT_ALLOWED_MIME_TYPES.has(mime)) {
    return { error: t("actions.tenantPayments.badReceiptType") }
  }

  if (fileValue.size > PAYMENT_RECEIPT_MAX_BYTES) {
    return { error: t("actions.tenantPayments.receiptTooBig") }
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
  // Переводчик нужен и в catch — объявляем до try.
  const { t, locale } = await getT()
  if (!session?.user) return { ok: false, error: t("actions.common.noAccess") }
  if (session.user.role !== "TENANT") return { ok: false, error: t("actions.tenantPayments.tenantOnly") }

  const amount = parsePositiveAmount(formData.get("amount"))
  if (!amount) return { ok: false, error: t("actions.tenantPayments.badAmount") }

  const paymentDate = parseDate(formData.get("paymentDate"))
  if (!paymentDate) return { ok: false, error: t("actions.tenantPayments.badDate") }

  const method = parsePaymentMethod(formData.get("method"))
  if (!method) return { ok: false, error: t("actions.tenantPayments.badMethod") }

  const note = String(formData.get("note") ?? "").trim().slice(0, 500)
  const paymentPurpose = String(formData.get("paymentPurpose") ?? "").trim().slice(0, 300)
  const receipt = await parseReceipt(formData.get("receipt"), t)
  if (receipt && "error" in receipt) return { ok: false, error: receipt.error }
  // Чек обязателен для безналичных способов (наличные подтверждает администратор).
  if (method !== "CASH" && !receipt) {
    return { ok: false, error: t("actions.tenantPayments.receiptRequired") }
  }
  const organizationId = session.user.organizationId
  if (!organizationId) return { ok: false, error: t("actions.common.organizationNotFound") }

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
        where: { deletedAt: null, isPaid: false },
        select: { id: true },
        take: 1,
      },
    },
  })
  if (!tenant) return { ok: false, error: t("actions.common.tenantNotFound") }

  const admins = await getTenantAdminContactsForUser(session.user.id)
  if (admins.length === 0) {
    return { ok: false, error: t("actions.tenantPayments.noAdminForSpace") }
  }

  const placement = formatTenantPlacement(tenant, {
    includeFloorName: false,
    emptyLabel: t("actions.tenantPayments.placementFallback"),
  })
  const formattedDate = formatDateShortL(locale, paymentDate)
  // Способ оплаты берём из общего раздела domain — он переведён.
  const methodLabel = t(`domain.paymentMethods.${method}` as "domain.paymentMethods.CASH")
  // Сообщение пишет арендатор администратору — берём язык автора сообщения.
  const body = [
    t("actions.tenantPayments.msgIntro"),
    "",
    t("actions.tenantPayments.msgTenant", { tenant: tenant.companyName }),
    t("actions.tenantPayments.msgSpace", { placement }),
    t("actions.tenantPayments.msgAmount", { amount: formatMoneyL(locale, amount) }),
    t("actions.tenantPayments.msgDate", { date: formattedDate }),
    t("actions.tenantPayments.msgMethod", { method: methodLabel }),
    paymentPurpose ? t("actions.tenantPayments.msgPurpose", { purpose: paymentPurpose }) : null,
    note ? t("actions.tenantPayments.msgNote", { note }) : null,
    receipt
      ? t("actions.tenantPayments.msgReceipt", { name: receipt.name })
      : method === "CASH"
        ? t("actions.tenantPayments.msgNoCashReceipt")
        : t("actions.tenantPayments.msgNoReceipt"),
    "",
    t("actions.tenantPayments.msgOutro"),
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
        subject: t("actions.tenantPayments.msgSubject"),
        body: `${body}\n\n${t("actions.tenantPayments.msgReportId", { id: report.id })}`,
        attachmentUrl: storedReceipt?.url ?? null,
      })),
    })

    for (const admin of admins) {
      // Уведомление читает администратор — берём язык получателя.
      const { t: tAdmin, locale: adminLocale } = await getTForUser(admin.id)
      await notifyUser({
        userId: admin.id,
        type: "PAYMENT_REPORTED",
        title: tAdmin("actions.tenantPayments.notifyTitle", { tenant: tenant.companyName }),
        message: tAdmin("actions.tenantPayments.notifyMessage", {
          amount: formatMoneyL(adminLocale, amount),
          date: formatDateShortL(adminLocale, paymentDate),
          method: tAdmin(`domain.paymentMethods.${method}` as "domain.paymentMethods.CASH"),
          receipt: receipt
            ? tAdmin("actions.tenantPayments.receiptAttached")
            : tAdmin("actions.tenantPayments.receiptMissing"),
        }),
        link: "/admin/finances",
        sendEmail: false,
        // Дедуп: арендатор перезагрузил страницу и платёж улетел дважды.
        dedupWindowHours: 1,
      })
    }
  } catch (e) {
    if (storedReceipt) {
      await db.storedFile.update({
        where: { id: storedReceipt.id },
        data: { deletedAt: new Date() },
      }).catch(() => null)
    }
    return { ok: false, error: e instanceof Error ? e.message : t("actions.tenantPayments.receiptSaveFailed") }
  }

  revalidatePath("/cabinet/finances")
  revalidatePath("/cabinet/messages")
  revalidatePath("/admin/messages")
  revalidatePath("/admin/finances")
  revalidatePath(`/admin/tenants/${tenant.id}`)

  return { ok: true, message: t("actions.tenantPayments.reported") }
}

export async function confirmPaymentReport(formData: FormData): Promise<ActionResult> {
  // Гард доступа (assertTenantBuildingAccess) и транзакция могут бросить исключение —
  // нельзя ронять страницу белым экраном (#0HBM6GB). Превращаем в понятный {ok:false}.
  const { t } = await getT()
  try {
    return await confirmPaymentReportImpl(formData)
  } catch (e) {
    if (isNextControlFlowError(e)) throw e
    return actionErrorResult(e, t("actions.tenantPayments.confirmFailed"), {
      source: "tenant-payments.confirmPaymentReport",
      route: "/admin/finances",
    })
  }
}

async function confirmPaymentReportImpl(formData: FormData): Promise<ActionResult> {
  await requireCapabilityAndFeature("finance.confirmPayment")
  const session = await auth()
  const { t, locale } = await getT()
  if (!session?.user) return { ok: false, error: t("actions.common.noAccess") }
  const { orgId } = await requireOrgAccess()

  const reportId = String(formData.get("reportId") ?? "").trim()
  if (!reportId) return { ok: false, error: t("actions.tenantPayments.reportRequired") }

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
  if (!report) return { ok: false, error: t("actions.tenantPayments.reportNotFound") }

  await assertTenantBuildingAccess(report.tenantId, orgId)

  const method = parsePaymentMethod(requestedMethod || report.method)
  if (!method) return { ok: false, error: t("actions.tenantPayments.badMethod") }
  if (method === "CASH") await requireCapabilityAndFeature("finance.cashPayment")

  if (cashAccountId) {
    const account = await db.cashAccount.findFirst({
      where: { id: cashAccountId, organizationId: orgId, isActive: true },
      select: { id: true },
    })
    if (!account) return { ok: false, error: t("actions.tenantPayments.badCashAccount") }
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
      return { ok: false, error: t("actions.finance.chargesNotInOrg") }
    }
  }

  if (chargeIds.length > 0) {
    if (selectedChargesTotal > report.amount + 0.01) {
      return {
        ok: false,
        error: t("actions.tenantPayments.chargesExceedPayment", {
          charges: formatMoneyL(locale, selectedChargesTotal),
          payment: formatMoneyL(locale, report.amount),
        }),
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
    // Уведомление читает арендатор — берём язык получателя.
    const { t: tTenant, locale: tenantLocale } = await getTForUser(tenant.userId)
    await notifyUser({
      userId: tenant.userId,
      type: "PAYMENT_CONFIRMED",
      title: tTenant("actions.tenantPayments.confirmedTitle"),
      message: tTenant("actions.tenantPayments.confirmedMessage", {
        amount: formatMoneyL(tenantLocale, report.amount),
      }),
      link: "/cabinet/finances",
      sendEmail: false,
    })
  }

  revalidatePath("/admin/finances")
  revalidatePath("/admin/finances/balance")
  revalidatePath("/cabinet/finances")
  revalidatePath(`/admin/tenants/${report.tenantId}`)

  const closedText = validChargeIds.length > 0
    ? ` ${t("actions.tenantPayments.chargesClosed", {
        count: validChargeIds.length,
        amount: formatMoneyL(locale, selectedChargesTotal),
      })}`
    : ""
  return {
    ok: true,
    message: t("actions.tenantPayments.paymentDone", { amount: formatMoneyL(locale, result.amount) }) + closedText,
  }
}

export async function markPaymentReportDisputed(formData: FormData): Promise<ActionResult> {
  const { t } = await getT()
  try {
    return await markPaymentReportDisputedImpl(formData)
  } catch (e) {
    if (isNextControlFlowError(e)) throw e
    return actionErrorResult(e, t("actions.tenantPayments.disputeFailed"), {
      source: "tenant-payments.markPaymentReportDisputed",
      route: "/admin/finances",
    })
  }
}

async function markPaymentReportDisputedImpl(formData: FormData): Promise<ActionResult> {
  await requireCapabilityAndFeature("finance.disputePayment")
  const session = await auth()
  const { t } = await getT()
  if (!session?.user) return { ok: false, error: t("actions.common.noAccess") }
  const { orgId } = await requireOrgAccess()

  const reportId = String(formData.get("reportId") ?? "").trim()
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500)
  if (!reportId) return { ok: false, error: t("actions.tenantPayments.reportRequired") }
  if (reason.length < 5) return { ok: false, error: t("actions.tenantPayments.disputeReasonRequired") }

  const report = await db.paymentReport.findFirst({
    where: { id: reportId, status: { in: ["PENDING", "DISPUTED"] }, ...paymentReportScope(orgId) },
    select: { id: true, tenantId: true, amount: true, userId: true, note: true },
  })
  if (!report) return { ok: false, error: t("actions.tenantPayments.reportNotFound") }

  await assertTenantBuildingAccess(report.tenantId, orgId)

  await db.paymentReport.update({
    where: { id: report.id },
    data: {
      status: "DISPUTED",
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      // note заявки — учётная запись в БД, остаётся русской.
      note: [report.note, `Спорная оплата: ${reason}`].filter(Boolean).join("\n\n"),
    },
  })

  // Уведомление читает арендатор — берём язык получателя.
  const { t: tTenant, locale: tenantLocale } = await getTForUser(report.userId)
  await notifyUser({
    userId: report.userId,
    type: "PAYMENT_DISPUTED",
    title: tTenant("actions.tenantPayments.needsClarificationTitle"),
    message: reason || tTenant("actions.tenantPayments.disputedMessage", {
      amount: formatMoneyL(tenantLocale, report.amount),
    }),
    link: "/cabinet/finances",
    sendEmail: false,
  })

  revalidatePath("/admin/finances")
  revalidatePath("/cabinet/finances")
  return { ok: true, message: t("actions.tenantPayments.markedDisputed") }
}

export async function rejectPaymentReport(formData: FormData): Promise<ActionResult> {
  const { t } = await getT()
  try {
    return await rejectPaymentReportImpl(formData)
  } catch (e) {
    if (isNextControlFlowError(e)) throw e
    return actionErrorResult(e, t("actions.tenantPayments.rejectFailed"), {
      source: "tenant-payments.rejectPaymentReport",
      route: "/admin/finances",
    })
  }
}

async function rejectPaymentReportImpl(formData: FormData): Promise<ActionResult> {
  await requireCapabilityAndFeature("finance.rejectPayment")
  const session = await auth()
  const { t } = await getT()
  if (!session?.user) return { ok: false, error: t("actions.common.noAccess") }
  const { orgId } = await requireOrgAccess()

  const reportId = String(formData.get("reportId") ?? "").trim()
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300)
  if (!reportId) return { ok: false, error: t("actions.tenantPayments.reportRequired") }

  const report = await db.paymentReport.findFirst({
    where: { id: reportId, status: { in: ["PENDING", "DISPUTED"] }, ...paymentReportScope(orgId) },
    select: { id: true, tenantId: true, amount: true, userId: true, note: true },
  })
  if (!report) return { ok: false, error: t("actions.tenantPayments.reportNotFound") }

  await assertTenantBuildingAccess(report.tenantId, orgId)

  await db.paymentReport.update({
    where: { id: report.id },
    data: {
      status: "REJECTED",
      reviewedById: session.user.id,
      reviewedAt: new Date(),
      // note заявки — учётная запись в БД, остаётся русской.
      note: reason
        ? [report.note, `Отклонено: ${reason}`].filter(Boolean).join("\n\n")
        : report.note,
    },
  })

  // Уведомление читает арендатор — берём язык получателя.
  const { t: tTenant, locale: tenantLocale } = await getTForUser(report.userId)
  await notifyUser({
    userId: report.userId,
    type: "PAYMENT_REJECTED",
    title: tTenant("actions.tenantPayments.needsClarificationTitle"),
    message: reason || tTenant("actions.tenantPayments.rejectedMessage", {
      amount: formatMoneyL(tenantLocale, report.amount),
    }),
    link: "/cabinet/finances",
    sendEmail: false,
  })

  revalidatePath("/admin/finances")
  revalidatePath("/cabinet/finances")
  return { ok: true, message: t("actions.tenantPayments.rejected") }
}
