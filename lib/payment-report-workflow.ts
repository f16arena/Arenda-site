import type { Prisma } from "@/app/generated/prisma/client"

type ConfirmablePaymentReport = {
  id: string
  tenantId: string
  amount: number
  paymentDate: Date
  method: string
  note: string | null
  paymentPurpose: string | null
  tenant: { companyName: string }
}

type ConfirmPaymentReportInput = {
  report: ConfirmablePaymentReport
  method: string
  reviewerId: string
  cashAccountId?: string | null
  chargeIds?: string[]
}

export async function applyConfirmedPaymentReport(
  tx: Prisma.TransactionClient,
  {
    report,
    method,
    reviewerId,
    cashAccountId = null,
    chargeIds = [],
  }: ConfirmPaymentReportInput,
) {
  const payment = await tx.payment.create({
    data: {
      tenantId: report.tenantId,
      amount: report.amount,
      method,
      note: report.note || report.paymentPurpose || `Проведено по заявке #${report.id}`,
      paymentDate: report.paymentDate,
    },
  })

  if (cashAccountId) {
    await tx.cashTransaction.create({
      data: {
        accountId: cashAccountId,
        amount: report.amount,
        type: "DEPOSIT",
        paymentId: payment.id,
        createdById: reviewerId,
        description: `Платеж от ${report.tenant.companyName} по заявке #${report.id}`,
      },
    })
    await tx.cashAccount.update({
      where: { id: cashAccountId },
      data: { balance: { increment: report.amount } },
    })
  }

  if (chargeIds.length > 0) {
    await tx.charge.updateMany({
      where: { id: { in: chargeIds } },
      data: { isPaid: true },
    })
  }

  await tx.paymentReport.update({
    where: { id: report.id },
    data: {
      status: "CONFIRMED",
      reviewedById: reviewerId,
      reviewedAt: new Date(),
      paymentId: payment.id,
    },
  })

  return payment
}
