"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { requireSection } from "@/lib/acl"
import { notifyUser } from "@/lib/notify"
import { requireOrgAccess } from "@/lib/org"
import { paymentReportScope, chargeScope } from "@/lib/tenant-scope"
import { getTenantAdminContactsForUser } from "@/lib/tenant-admin-contact"
import { assertTenantBuildingAccess } from "@/lib/building-access"
import { formatMoney } from "@/lib/utils"
import { revalidatePath } from "next/cache"

type ActionResult = {
  ok: boolean
  message?: string
  error?: string
}

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

async function parseReceipt(fileValue: FormDataEntryValue | null) {
  if (!(fileValue instanceof File) || fileValue.size === 0) return null

  const allowed = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"])
  if (!allowed.has(fileValue.type)) {
    return { error: "Чек должен быть PDF, JPG, PNG или WebP" as const }
  }

  const maxBytes = 1.5 * 1024 * 1024
  if (fileValue.size > maxBytes) {
    return { error: "Файл чека не должен быть больше 1.5 МБ" as const }
  }

  const buffer = Buffer.from(await fileValue.arrayBuffer())
  return {
    name: fileValue.name.slice(0, 160),
    mime: fileValue.type,
    dataUrl: `data:${fileValue.type};base64,${buffer.toString("base64")}`,
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

  const note = String(formData.get("note") ?? "").trim().slice(0, 500)
  const paymentPurpose = String(formData.get("paymentPurpose") ?? "").trim().slice(0, 300)
  const receipt = await parseReceipt(formData.get("receipt"))
  if (receipt && "error" in receipt) return { ok: false, error: receipt.error }

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      companyName: true,
      space: { select: { number: true } },
      fullFloors: { select: { name: true }, take: 1 },
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

  const placement = tenant.space?.number
    ? `Каб. ${tenant.space.number}`
    : tenant.fullFloors[0]?.name ?? "помещение по договору"
  const formattedDate = paymentDate.toLocaleDateString("ru-RU")
  const body = [
    "Здравствуйте. Сообщаю об оплате.",
    "",
    `Арендатор: ${tenant.companyName}`,
    `Помещение: ${placement}`,
    `Сумма: ${formatMoney(amount)}`,
    `Дата оплаты: ${formattedDate}`,
    paymentPurpose ? `Назначение платежа: ${paymentPurpose}` : null,
    note ? `Комментарий: ${note}` : null,
    receipt ? `Чек: ${receipt.name}` : "Чек: не приложен",
    "",
    "Пожалуйста, проверьте поступление и отметьте платеж в системе.",
  ].filter(Boolean).join("\n")

  const report = await db.paymentReport.create({
    data: {
      tenantId: tenant.id,
      userId: session.user.id,
      amount,
      paymentDate,
      paymentPurpose: paymentPurpose || null,
      note: note || null,
      receiptName: receipt?.name ?? null,
      receiptMime: receipt?.mime ?? null,
      receiptDataUrl: receipt?.dataUrl ?? null,
    },
  })

  await db.message.createMany({
    data: admins.map((admin) => ({
      fromId: session.user.id,
      toId: admin.id,
      subject: "Арендатор сообщил об оплате",
      body: `${body}\n\nЗаявка об оплате: #${report.id}`,
      attachmentUrl: receipt?.dataUrl ?? null,
    })),
  })

  for (const admin of admins) {
    await notifyUser({
      userId: admin.id,
      type: "PAYMENT_REPORTED",
      title: `Оплата от ${tenant.companyName}`,
      message: `${formatMoney(amount)} за ${formattedDate}. ${receipt ? "Чек приложен." : "Чек не приложен."}`,
      link: "/admin/finances",
      sendEmail: false,
    })
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
  const method = String(formData.get("method") ?? "").trim() || "TRANSFER"
  const chargeIds = formData.getAll("chargeIds").map((value) => String(value)).filter(Boolean)

  const report = await db.paymentReport.findFirst({
    where: { id: reportId, status: "PENDING", ...paymentReportScope(orgId) },
    select: {
      id: true,
      tenantId: true,
      amount: true,
      paymentDate: true,
      note: true,
      paymentPurpose: true,
      tenant: { select: { companyName: true } },
    },
  })
  if (!report) return { ok: false, error: "Заявка об оплате не найдена или уже обработана" }

  await assertTenantBuildingAccess(report.tenantId, orgId)

  if (cashAccountId) {
    const account = await db.cashAccount.findFirst({
      where: { id: cashAccountId, organizationId: orgId, isActive: true },
      select: { id: true },
    })
    if (!account) return { ok: false, error: "Указан недоступный счет зачисления" }
  }

  let validChargeIds: string[] = []
  if (chargeIds.length > 0) {
    const validCharges = await db.charge.findMany({
      where: {
        AND: [
          chargeScope(orgId),
          { id: { in: chargeIds }, tenantId: report.tenantId },
        ],
      },
      select: { id: true },
    })
    validChargeIds = validCharges.map((charge) => charge.id)
    if (validChargeIds.length !== chargeIds.length) {
      return { ok: false, error: "Некоторые начисления недоступны для текущей организации" }
    }
  }

  const result = await db.$transaction(async (tx) => {
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
          createdById: session.user.id,
          description: `Платеж от ${report.tenant.companyName} по заявке #${report.id}`,
        },
      })
      await tx.cashAccount.update({
        where: { id: cashAccountId },
        data: { balance: { increment: report.amount } },
      })
    }

    if (validChargeIds.length > 0) {
      await tx.charge.updateMany({
        where: { id: { in: validChargeIds } },
        data: { isPaid: true },
      })
    }

    await tx.paymentReport.update({
      where: { id: report.id },
      data: {
        status: "CONFIRMED",
        reviewedById: session.user.id,
        reviewedAt: new Date(),
        paymentId: payment.id,
      },
    })

    return payment
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

  return { ok: true, message: `Платеж проведен: ${formatMoney(result.amount)}` }
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
    where: { id: reportId, status: "PENDING", ...paymentReportScope(orgId) },
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
