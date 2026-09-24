import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileTenantRequest, getMobileTenantSummary, getMobilePaymentPurpose, currentPeriod, parseMobileDate, parsePositiveAmount } from "@/lib/mobile-tenant"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { getTenantAdminContactsForUser } from "@/lib/tenant-admin-contact"
import { notifyUser } from "@/lib/notify"
import { mobileError } from "@/lib/mobile-context"
import { getTForUser } from "@/lib/i18n/server"
import { formatMoneyL, formatDateShortL, taxIdLabelL } from "@/lib/i18n/format"
import {
  PAYMENT_RECEIPT_ALLOWED_MIME_TYPES,
  PAYMENT_RECEIPT_MAX_BYTES,
  getTenantStorageScope,
  storeUploadedFile,
} from "@/lib/storage"

export const dynamic = "force-dynamic"

const PAYMENT_METHODS = new Set(["TRANSFER", "KASPI", "CASH", "CARD"])

export async function GET(req: Request) {
  const result = await getMobileTenantRequest(req)
  if (!result.ok) return result.response

  const { ctx, tenant } = result
  // Реквизиты и QR читает арендатор — язык из его профиля (cookie тут нет).
  const { t, locale } = await getTForUser(ctx.user.id)
  const period = currentPeriod()
  const paymentPurpose = getMobilePaymentPurpose(tenant, period)
  const origin = new URL(req.url).origin

  const [totalDebt, charges, payments, reports, landlord, installmentPlans] = await Promise.all([
    // deletedAt:null обязателен — иначе мобилка покажет другую сумму, чем /cabinet/finances.
    db.charge.aggregate({
      where: { tenantId: tenant.id, isPaid: false, deletedAt: null },
      _sum: { amount: true },
    }),
    db.charge.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
      select: {
        id: true,
        period: true,
        type: true,
        amount: true,
        description: true,
        isPaid: true,
        dueDate: true,
        createdAt: true,
      },
      orderBy: [{ period: "desc" }, { createdAt: "desc" }],
      take: 80,
    }),
    db.payment.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, amount: true, paymentDate: true, method: true, note: true, createdAt: true },
      orderBy: { paymentDate: "desc" },
      take: 20,
    }),
    db.paymentReport.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        amount: true,
        paymentDate: true,
        method: true,
        status: true,
        paymentPurpose: true,
        note: true,
        receiptName: true,
        receiptMime: true,
        receiptFileId: true,
        reviewedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    getOrganizationRequisites(ctx.org.id),
    // Действующие планы рассрочки арендатора (просмотр графика).
    db.debtInstallmentPlan.findMany({
      where: { tenantId: tenant.id, status: { in: ["ACTIVE", "BROKEN"] } },
      select: {
        id: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        installments: {
          select: { id: true, seq: true, dueDate: true, amount: true, isPaid: true },
          orderBy: { seq: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ])

  const accounts = landlord.bankAccounts.map((account) => ({
    label: account.label,
    bank: account.bank,
    bik: account.bik,
    account: account.iik,
    isPrimary: account.isPrimary,
  }))

  const payableAmount = totalDebt._sum.amount && totalDebt._sum.amount > 0
    ? totalDebt._sum.amount
    : getMobileTenantSummary(tenant).monthlyRent
  const primaryAccount = accounts[0]
  // Подпись БИН/ИИН в казахском своя (БСН/ЖСН) — берём её через taxIdLabelL.
  const qrText = [
    t("emails.requisites.recipient", { value: landlord.fullName }),
    `${taxIdLabelL(locale, landlord.taxIdLabel)}: ${landlord.taxId}`,
    primaryAccount ? t("emails.requisites.bank", { value: primaryAccount.bank }) : null,
    primaryAccount ? t("emails.requisites.bik", { value: primaryAccount.bik }) : null,
    primaryAccount ? t("emails.requisites.iik", { value: primaryAccount.account }) : null,
    t("emails.requisites.purpose", { value: paymentPurpose }),
    t("emails.requisites.payable", { value: formatMoneyL(locale, payableAmount) }),
  ].filter(Boolean).join("\n")

  return NextResponse.json({
    tenant: getMobileTenantSummary(tenant),
    summary: {
      totalDebt: totalDebt._sum.amount ?? 0,
      payableAmount,
      paymentPurpose,
      currentPeriod: period,
    },
    requisites: {
      recipient: landlord.fullName,
      taxIdLabel: taxIdLabelL(locale, landlord.taxIdLabel),
      taxId: landlord.taxId,
      accounts,
      qrText,
    },
    charges,
    payments,
    paymentReports: reports.map((report) => ({
      ...report,
      receiptUrl: report.receiptFileId
        ? `${origin}/api/mobile/tenant/documents/storage/${report.receiptFileId}`
        : null,
    })),
    installmentPlans,
  })
}

export async function POST(req: Request) {
  const result = await getMobileTenantRequest(req)
  if (!result.ok) return result.response

  const { ctx, tenant } = result
  const { t } = await getTForUser(ctx.user.id)
  const parsed = await parsePaymentBody(req)
  const body = parsed.body

  if (!body) return mobileError(t("adminDocs.api.common.badRequest"))

  const amount = parsePositiveAmount(body.amount)
  if (!amount) return mobileError(t("adminDocs.api.payments.badAmount"))

  const paymentDate = parseMobileDate(body.paymentDate)
  if (!paymentDate) return mobileError(t("adminDocs.api.payments.badDate"))

  const method = String(body.method ?? "TRANSFER").trim().toUpperCase()
  if (!PAYMENT_METHODS.has(method)) return mobileError(t("adminDocs.api.payments.badMethod"))

  const paymentPurpose = String(body.paymentPurpose ?? getMobilePaymentPurpose(tenant)).trim().slice(0, 300)
  const note = String(body.note ?? "").trim().slice(0, 500)
  const admins = await getTenantAdminContactsForUser(ctx.user.id)
  if (admins.length === 0) {
    return mobileError(t("adminDocs.api.common.noAdminForSpaceSupport"), 409)
  }

  let storedReceipt: { id: string; url: string; fileName: string; mimeType: string } | null = null
  if (parsed.receipt && parsed.receipt.size > 0) {
    try {
      const scope = await getTenantStorageScope(tenant.id)
      storedReceipt = await storeUploadedFile({
        organizationId: ctx.org.id,
        file: parsed.receipt,
        ownerType: "PAYMENT_RECEIPT",
        buildingId: scope.buildingId,
        tenantId: tenant.id,
        category: "PAYMENT_RECEIPT",
        visibility: "TENANT_VISIBLE",
        uploadedById: ctx.user.id,
        maxBytes: PAYMENT_RECEIPT_MAX_BYTES,
        allowedMimeTypes: PAYMENT_RECEIPT_ALLOWED_MIME_TYPES,
      })
    } catch (error) {
      return mobileError(error instanceof Error ? error.message : t("adminDocs.api.payments.receiptFailed"))
    }
  }

  const report = await db.paymentReport.create({
    data: {
      tenantId: tenant.id,
      userId: ctx.user.id,
      amount,
      paymentDate,
      method,
      paymentPurpose: paymentPurpose || null,
      note: note || null,
      receiptName: storedReceipt?.fileName ?? null,
      receiptMime: storedReceipt?.mimeType ?? null,
      receiptFileId: storedReceipt?.id ?? null,
    },
    select: {
      id: true,
      amount: true,
      paymentDate: true,
      method: true,
      status: true,
      paymentPurpose: true,
      note: true,
      receiptName: true,
      receiptMime: true,
      receiptFileId: true,
      createdAt: true,
    },
  })

  if (storedReceipt) {
    await db.storedFile.update({
      where: { id: storedReceipt.id },
      data: { ownerId: report.id },
    })
  }

  // Письмо и уведомление читают администраторы, а языки у них разные —
  // поэтому тело собирается отдельно на каждого получателя.
  const rows = await Promise.all(admins.map(async (admin) => {
    const { t: tAdmin, locale: adminLocale } = await getTForUser(admin.id)
    const methodLabel = tAdmin(`domain.paymentMethods.${method}` as Parameters<typeof tAdmin>[0])
    return {
      fromId: ctx.user.id,
      toId: admin.id,
      subject: tAdmin("emails.paymentReport.subject"),
      body: [
        tAdmin("emails.paymentReport.tenantLine", { tenant: tenant.companyName }),
        tAdmin("emails.paymentReport.amountLine", { amount: formatMoneyL(adminLocale, amount) }),
        tAdmin("emails.paymentReport.dateLine", { date: formatDateShortL(adminLocale, paymentDate) }),
        tAdmin("emails.paymentReport.methodLine", { method: methodLabel }),
        paymentPurpose ? tAdmin("emails.paymentReport.purposeLine", { purpose: paymentPurpose }) : null,
        note ? tAdmin("emails.paymentReport.noteLine", { note }) : null,
        storedReceipt
          ? tAdmin("emails.paymentReport.receiptLine", { file: storedReceipt.fileName })
          : tAdmin("emails.paymentReport.noReceipt"),
      ].filter(Boolean).join("\n"),
      attachmentUrl: storedReceipt?.url ?? null,
    }
  }))
  await db.message.createMany({ data: rows })

  await Promise.allSettled(admins.map(async (admin) => {
    const { t: tAdmin, locale: adminLocale } = await getTForUser(admin.id)
    const vars = {
      amount: formatMoneyL(adminLocale, amount),
      date: formatDateShortL(adminLocale, paymentDate),
      method: tAdmin(`domain.paymentMethods.${method}` as Parameters<typeof tAdmin>[0]),
    }
    return notifyUser({
      userId: admin.id,
      type: "PAYMENT_REPORTED",
      title: tAdmin("emails.paymentReport.notifyTitle", { tenant: tenant.companyName }),
      message: storedReceipt
        ? tAdmin("emails.paymentReport.notifyMessageWithReceipt", vars)
        : tAdmin("emails.paymentReport.notifyMessage", vars),
      link: "/admin/finances",
      sendEmail: false,
      sendPush: true,
      pushData: {
        paymentReportId: report.id,
        tenantId: tenant.id,
      },
    })
  }))

  return NextResponse.json({ data: report }, { status: 201 })
}

async function parsePaymentBody(req: Request): Promise<{
  body: {
    amount?: unknown
    paymentDate?: unknown
    method?: string
    paymentPurpose?: string
    note?: string
  } | null
  receipt: File | null
}> {
  const contentType = req.headers.get("content-type") ?? ""
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData()
    const receiptValue = form.get("receipt")
    return {
      body: {
        amount: form.get("amount"),
        paymentDate: form.get("paymentDate"),
        method: String(form.get("method") ?? ""),
        paymentPurpose: String(form.get("paymentPurpose") ?? ""),
        note: String(form.get("note") ?? ""),
      },
      receipt: receiptValue instanceof File ? receiptValue : null,
    }
  }

  return {
    body: await req.json().catch(() => null),
    receipt: null,
  }
}
