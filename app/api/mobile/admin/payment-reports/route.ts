import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { mobileError } from "@/lib/mobile-context"
import { getMobilePaymentStaffRequest, paymentReportInBuildingsWhere, tenantInBuildingsWhere } from "@/lib/mobile-admin"
import { notifyUser } from "@/lib/notify"
import { applyConfirmedPaymentReport } from "@/lib/payment-report-workflow"
import { getTForUser } from "@/lib/i18n/server"
import { formatMoneyL } from "@/lib/i18n/format"

export const dynamic = "force-dynamic"

const DAY_MS = 24 * 60 * 60 * 1000

export async function GET(req: Request) {
  const result = await getMobilePaymentStaffRequest(req)
  if (!result.ok) return result.response

  const origin = new URL(req.url).origin
  const url = new URL(req.url)
  const buildingId = (url.searchParams.get("buildingId") ?? "").trim() || null
  const scopedBuildingIds = buildingId
    ? result.buildingIds.includes(buildingId) ? [buildingId] : ["__none__"]
    : result.buildingIds
  const now = new Date()
  const dueSoon = new Date(now.getTime() + 21 * DAY_MS)
  const [reports, expectedPayments] = await Promise.all([
    db.paymentReport.findMany({
      where: {
        status: { in: ["PENDING", "DISPUTED", "REJECTED"] },
        ...paymentReportInBuildingsWhere(scopedBuildingIds),
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
        tenant: {
          select: {
            id: true,
            companyName: true,
            userId: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.charge.findMany({
      where: {
        isPaid: false,
        dueDate: { lte: dueSoon },
        tenant: tenantInBuildingsWhere(scopedBuildingIds),
      },
      select: {
        id: true,
        amount: true,
        period: true,
        type: true,
        description: true,
        dueDate: true,
        createdAt: true,
        tenant: {
          select: {
            id: true,
            companyName: true,
            userId: true,
          },
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 80,
    }),
  ])

  const overduePayments = expectedPayments.filter((payment) => payment.dueDate && payment.dueDate < now)

  return NextResponse.json({
    data: reports.map((report) => ({
      ...report,
      receiptUrl: report.receiptFileId
        ? `${origin}/api/mobile/tenant/documents/storage/${report.receiptFileId}`
        : null,
    })),
    expectedPayments: expectedPayments.map((payment) => ({
      ...payment,
      isOverdue: !!payment.dueDate && payment.dueDate < now,
    })),
    counters: {
      total: reports.length,
      pending: reports.filter((report) => report.status === "PENDING").length,
      disputed: reports.filter((report) => report.status === "DISPUTED").length,
      amount: reports.reduce((sum, report) => sum + report.amount, 0),
      expected: expectedPayments.length,
      expectedAmount: expectedPayments.reduce((sum, payment) => sum + payment.amount, 0),
      overdue: overduePayments.length,
      overdueAmount: overduePayments.reduce((sum, payment) => sum + payment.amount, 0),
    },
  })
}

export async function PATCH(req: Request) {
  const result = await getMobilePaymentStaffRequest(req)
  if (!result.ok) return result.response

  const body = await req.json().catch(() => null) as {
    reportId?: string
    action?: "confirm" | "dispute" | "reject"
    reason?: string
    method?: string
  } | null

  // Ошибки читает админ, уведомления — арендатор: переводчиков нужно два.
  const { t } = await getTForUser(result.ctx.user.id)
  const reportId = String(body?.reportId ?? "").trim()
  const action = String(body?.action ?? "").trim().toLowerCase()
  const reason = String(body?.reason ?? "").trim().slice(0, 500)

  if (!reportId) return mobileError("reportId is required")
  if (!["confirm", "dispute", "reject"].includes(action)) return mobileError(t("adminDocs.api.payments.badAction"))

  const report = await db.paymentReport.findFirst({
    where: {
      id: reportId,
      status: { in: ["PENDING", "DISPUTED"] },
      ...paymentReportInBuildingsWhere(result.buildingIds),
    },
    select: {
      id: true,
      tenantId: true,
      amount: true,
      paymentDate: true,
      method: true,
      note: true,
      paymentPurpose: true,
      userId: true,
      tenant: { select: { companyName: true } },
    },
  })
  if (!report) return mobileError(t("adminDocs.api.payments.reportNotFound"), 404)

  if (action === "confirm") {
    const method = String(body?.method ?? report.method).trim().toUpperCase()
    const payment = await db.$transaction((tx) => applyConfirmedPaymentReport(tx, {
      report,
      method,
      reviewerId: result.ctx.user.id,
    }))

    const { t: tTenant, locale: tenantLocale } = await getTForUser(report.userId)
    await notifyUser({
      userId: report.userId,
      type: "PAYMENT_CONFIRMED",
      title: tTenant("emails.paymentReport.confirmedTitle"),
      message: tTenant("emails.paymentReport.confirmedMessage", {
        amount: formatMoneyL(tenantLocale, report.amount),
      }),
      link: "/cabinet/finances",
      sendEmail: false,
      sendPush: true,
      pushData: { paymentId: payment.id, paymentReportId: report.id },
    })

    return NextResponse.json({ ok: true, status: "CONFIRMED", paymentId: payment.id })
  }

  const nextStatus = action === "dispute" ? "DISPUTED" : "REJECTED"
  const updated = await db.paymentReport.update({
    where: { id: report.id },
    data: {
      status: nextStatus,
      reviewedById: result.ctx.user.id,
      reviewedAt: new Date(),
      // Приписку к заметке читает администрация — берём язык проверяющего.
      note: reason
        ? [
            report.note,
            nextStatus === "DISPUTED"
              ? t("emails.paymentReport.disputedNote", { reason })
              : t("emails.paymentReport.rejectedNote", { reason }),
          ].filter(Boolean).join("\n\n")
        : report.note,
    },
    select: { id: true, status: true, amount: true },
  })

  const { t: tTenant, locale: tenantLocale } = await getTForUser(report.userId)
  await notifyUser({
    userId: report.userId,
    type: nextStatus === "DISPUTED" ? "PAYMENT_DISPUTED" : "PAYMENT_REJECTED",
    title: nextStatus === "DISPUTED"
      ? tTenant("emails.paymentReport.disputedTitle")
      : tTenant("emails.paymentReport.rejectedTitle"),
    message: reason || tTenant("emails.paymentReport.rejectedMessage", {
      amount: formatMoneyL(tenantLocale, report.amount),
    }),
    link: "/cabinet/finances",
    sendEmail: false,
    sendPush: true,
    pushData: { paymentReportId: report.id, status: nextStatus },
  })

  return NextResponse.json({ data: updated })
}
