import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { authorizeCronRequest } from "@/lib/cron-auth"
import { sendEmail, basicEmailTemplate, htmlEscape } from "@/lib/email"

export const dynamic = "force-dynamic"

// Ежедневный cron в 09:00 UTC (≈14:00 Алматы) — оптимальное время для email.
// Шлёт reminder арендатору за 3, 1, 0 дней до dueDate каждого неоплаченного charge.
//
// Soft-delete: extension в lib/db автоматически фильтрует Charge.deletedAt = null,
// так что удалённые начисления не получат напоминание.

const CHARGE_TYPE_LABELS: Record<string, string> = {
  RENT: "Аренда",
  CLEANING: "Уборка",
  PENALTY: "Пеня",
  ELECTRICITY: "Электричество",
  WATER: "Вода",
  HEATING: "Отопление",
  GAS: "Газ",
  INTERNET: "Интернет",
  PARKING: "Парковка",
  OTHER: "Другое",
}

function formatChargeType(type: string): string {
  return CHARGE_TYPE_LABELS[type] ?? type
}

function formatDueDate(date: Date | null): string {
  if (!date) return "—"
  return date.toLocaleDateString("ru-RU")
}

function formatMoney(amount: number): string {
  return `${amount.toLocaleString("ru-RU")} ₸`
}

export async function GET(req: Request) {
  if (!authorizeCronRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const targets = [
    { days: 3, label: "через 3 дня" },
    { days: 1, label: "завтра" },
    { days: 0, label: "сегодня" },
  ]

  const stats = { sent: 0, failed: 0, skipped: 0 }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""

  for (const target of targets) {
    const dueStart = new Date(today)
    dueStart.setDate(dueStart.getDate() + target.days)
    const dueEnd = new Date(dueStart)
    dueEnd.setDate(dueEnd.getDate() + 1)

    const charges = await db.charge.findMany({
      where: {
        isPaid: false,
        dueDate: { gte: dueStart, lt: dueEnd },
      },
      include: {
        tenant: { include: { user: true } },
      },
    })

    for (const charge of charges) {
      const user = charge.tenant.user
      if (!user?.email || !user.notifyEmail) {
        stats.skipped++
        continue
      }

      const safeType = htmlEscape(formatChargeType(charge.type))
      const safePeriod = htmlEscape(charge.period)
      const safeAmount = htmlEscape(formatMoney(charge.amount))
      const safeDue = htmlEscape(formatDueDate(charge.dueDate))
      const safeLabel = htmlEscape(target.label)

      const html = basicEmailTemplate({
        title: `Срок оплаты ${target.label}`,
        body: `<p>Уважаемый клиент,</p>
<p>Напоминаем что срок оплаты ${safeLabel}:</p>
<ul>
  <li><strong>Период:</strong> ${safePeriod}</li>
  <li><strong>Тип:</strong> ${safeType}</li>
  <li><strong>Сумма:</strong> ${safeAmount}</li>
  <li><strong>Срок:</strong> ${safeDue}</li>
</ul>`,
        buttonText: "Открыть кабинет",
        buttonUrl: `${appUrl}/cabinet/finances`,
        footer: "Если уже оплатили — игнорируйте это сообщение.",
      })

      const result = await sendEmail({
        to: user.email,
        subject: `Напоминание об оплате (${target.label})`,
        html,
        text: `Срок оплаты ${target.label}. Сумма: ${formatMoney(charge.amount)}. Период: ${charge.period}.`,
      })

      if (result.ok) stats.sent++
      else stats.failed++
    }
  }

  return NextResponse.json({ ok: true, ...stats, ranAt: new Date().toISOString() })
}
