import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getMobileTenantRequest, getMobileTenantSummary, getMobilePaymentPurpose, currentPeriod, parseMobileDate, parsePositiveAmount } from "@/lib/mobile-tenant"
import { getOrganizationRequisites } from "@/lib/organization-requisites"
import { getTenantAdminContactsForUser } from "@/lib/tenant-admin-contact"
import { notifyUser } from "@/lib/notify"
import { mobileError } from "@/lib/mobile-context"
import { PAYMENT_METHOD_LABELS, formatMoney } from "@/lib/utils"
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
  const period = currentPeriod()
  const paymentPurpose = getMobilePaymentPurpose(tenant, period)
  const origin = new URL(req.url).origin

  const [totalDebt, charges, payments, reports, landlord] = await Promise.all([
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
  const qrText = [
    `Получатель: ${landlord.fullName}`,
    `${landlord.taxIdLabel}: ${landlord.taxId}`,
    primaryAccount ? `Банк: ${primaryAccount.bank}` : null,
    primaryAccount ? `БИК: ${primaryAccount.bik}` : null,
    primaryAccount ? `ИИК: ${primaryAccount.account}` : null,
    `Назначение: ${paymentPurpose}`,
    `Сумма к оплате: ${formatMoney(payableAmount)}`,
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
      taxIdLabel: landlord.taxIdLabel,
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
  })
}

export async function POST(req: Request) {
  const result = await getMobileTenantRequest(req)
  if (!result.ok) return result.response

  const { ctx, tenant } = result
  const parsed = await parsePaymentBody(req)
  const body = parsed.body

  if (!body) return mobileError("Некорректный запрос")

  const amount = parsePositiveAmount(body.amount)
  if (!amount) return mobileError("Введите корректную сумму оплаты")

  const paymentDate = parseMobileDate(body.paymentDate)
  if (!paymentDate) return mobileError("Введите корректную дату оплаты")

  const method = String(body.method ?? "TRANSFER").trim().toUpperCase()
  if (!PAYMENT_METHODS.has(method)) return mobileError("Выберите корректный способ оплаты")

  const paymentPurpose = String(body.paymentPurpose ?? getMobilePaymentPurpose(tenant)).trim().slice(0, 300)
  const note = String(body.note ?? "").trim().slice(0, 500)
  const admins = await getTenantAdminContactsForUser(ctx.user.id)
  if (admins.length === 0) {
    return mobileError("Для вашего помещения не назначен администратор. Напишите в поддержку здания.", 409)
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
      return mobileError(error instanceof Error ? error.message : "Не удалось сохранить чек")
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

  const methodLabel = PAYMENT_METHOD_LABELS[method] ?? method
  const formattedDate = paymentDate.toLocaleDateString("ru-RU")
  await db.message.createMany({
    data: admins.map((admin) => ({
      fromId: ctx.user.id,
      toId: admin.id,
      subject: "Арендатор сообщил об оплате",
      body: [
        `Арендатор: ${tenant.companyName}`,
        `Сумма: ${formatMoney(amount)}`,
        `Дата оплаты: ${formattedDate}`,
        `Способ оплаты: ${methodLabel}`,
        paymentPurpose ? `Назначение платежа: ${paymentPurpose}` : null,
        note ? `Комментарий: ${note}` : null,
        storedReceipt ? `Чек: ${storedReceipt.fileName}` : "Чек не приложен",
      ].filter(Boolean).join("\n"),
      attachmentUrl: storedReceipt?.url ?? null,
    })),
  })

  await Promise.allSettled(admins.map((admin) => notifyUser({
    userId: admin.id,
    type: "PAYMENT_REPORTED",
    title: `Оплата от ${tenant.companyName}`,
    message: `${formatMoney(amount)} за ${formattedDate}. ${methodLabel}.${storedReceipt ? " Чек приложен." : ""}`,
    link: "/admin/finances",
    sendEmail: false,
    sendPush: true,
    pushData: {
      paymentReportId: report.id,
      tenantId: tenant.id,
    },
  })))

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
