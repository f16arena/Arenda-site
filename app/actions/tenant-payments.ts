"use server"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { notifyUser } from "@/lib/notify"
import { getTenantAdminContactsForUser } from "@/lib/tenant-admin-contact"
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

  const tenant = await db.tenant.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      companyName: true,
      space: { select: { number: true } },
      fullFloors: { select: { name: true }, take: 1 },
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
    "",
    "Пожалуйста, проверьте поступление и отметьте платеж в системе.",
  ].filter(Boolean).join("\n")

  await db.message.createMany({
    data: admins.map((admin) => ({
      fromId: session.user.id,
      toId: admin.id,
      subject: "Арендатор сообщил об оплате",
      body,
    })),
  })

  for (const admin of admins) {
    await notifyUser({
      userId: admin.id,
      type: "PAYMENT_REPORTED",
      title: `Оплата от ${tenant.companyName}`,
      message: `${formatMoney(amount)} за ${formattedDate}. Проверьте поступление.`,
      link: `/admin/tenants/${tenant.id}`,
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
